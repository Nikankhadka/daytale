import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import { DATABASE_NAME, type SQLiteDatabaseLike } from './database';
import { type MigrationDatabase, type MigrationTransaction } from './migrations';
import { invalidateStorageBootstrap } from './bootstrap';
import {
  applyRecordingSessionOperationInTransaction,
  type RecordingSessionOperationResult,
} from './repositories';
import { deleteDatabaseKey, type SecureKeyDependencies } from './secureKey';
import {
  CLEANUP_RECORD_KINDS,
  MAX_RETRY_WINDOW_MS,
  type CleanupReceipt,
  type RecordingOperation,
  validateCleanupReceipt,
  validateStorageId,
} from './types';

export type CleanupDependencies = {
  deleteFile?: (path: string) => Promise<void>;
  hash?: (value: string) => Promise<string>;
  uuid?: () => string;
  now?: () => string;
  deleteDatabase?: (databaseName: string) => Promise<void>;
  stopActiveCapture?: () => Promise<void>;
  secureKey?: SecureKeyDependencies;
};

export type CleanupDatabase = SQLiteDatabaseLike;

export class CleanupError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CleanupError';
  }
}

type ExpirySessionRow = {
  id: string;
  status: string;
  retry_until: string | null;
  retry_target: string | null;
  updated_at: string;
};

type AudioChunkPathRow = {
  id: string;
  encrypted_path: string;
};

const RETRY_TARGETS: readonly string[] = [
  'recording',
  'transcribing',
  'analyzing',
  'awaiting clarification',
  'generating',
];

const EXPIRY_DELETES = [
  'DELETE FROM clarification_answers WHERE question_id IN (SELECT id FROM clarification_questions WHERE session_id = ?)',
  'DELETE FROM clarification_questions WHERE session_id = ?',
  'DELETE FROM extracted_events WHERE session_id = ?',
  'DELETE FROM transcript_segments WHERE session_id = ?',
  'DELETE FROM audio_chunks WHERE session_id = ?',
] as const;

const DELETE_ALL_STATEMENTS = [
  'DELETE FROM clarification_answers',
  'DELETE FROM clarification_questions',
  'DELETE FROM extracted_events',
  'DELETE FROM transcript_segments',
  'DELETE FROM audio_chunks',
  'DELETE FROM journal_entries',
  'DELETE FROM cleanup_receipts',
  'DELETE FROM recording_operations',
  'DELETE FROM recording_sessions',
  'DELETE FROM voice_profiles',
  'DELETE FROM app_preferences',
] as const;

const defaultDeleteFile = async (path: string): Promise<void> => {
  const { deleteAsync } = await import('expo-file-system/legacy');
  await deleteAsync(path, { idempotent: true });
};

const defaultHash = (value: string): Promise<string> =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
    encoding: Crypto.CryptoEncoding.HEX,
  });

const defaultUuid = (): string => Crypto.randomUUID();

const defaultNow = (): string => new Date().toISOString();

const defaultDeleteDatabase = (databaseName: string): Promise<void> =>
  SQLite.deleteDatabaseAsync(databaseName);

export async function cleanupExpiredSession(
  database: CleanupDatabase,
  sessionId: string,
  dependencies: CleanupDependencies = {},
): Promise<CleanupReceipt | null> {
  const validatedSessionId = validateStorageId(sessionId);
  const completedAt = validateUtcTimestamp((dependencies.now ?? defaultNow)());
  const deleteFile = dependencies.deleteFile ?? defaultDeleteFile;
  const hash = dependencies.hash ?? defaultHash;
  const uuid = dependencies.uuid ?? defaultUuid;

  return withExclusiveTransaction(database, async (transaction) => {
    const session = await transaction.getFirstAsync<ExpirySessionRow>(
      `SELECT id, status, retry_until, retry_target, updated_at
       FROM recording_sessions
       WHERE id = ?`,
      validatedSessionId,
    );

    if (session === null) {
      return null;
    }
    validateStorageId(session.id);
    if (session.id !== validatedSessionId) {
      throw new CleanupError('Stored recording session identity is invalid.');
    }
    if (session.status !== 'failed') {
      return null;
    }
    if (session.retry_until === null && session.retry_target !== null) {
      throw new CleanupError('Stored retry metadata is incomplete.');
    }
    if (session.retry_until === null) {
      return null;
    }
    if (session.retry_target !== null && !RETRY_TARGETS.includes(session.retry_target)) {
      throw new CleanupError('Stored retry target is invalid.');
    }
    const retryUntil = validateUtcTimestamp(session.retry_until);
    const updatedAt = validateUtcTimestamp(session.updated_at);
    const effectiveDeadline = Math.min(
      Date.parse(retryUntil),
      Date.parse(updatedAt) + MAX_RETRY_WINDOW_MS,
    );
    if (effectiveDeadline > Date.parse(completedAt)) {
      return null;
    }

    const operationId = validateStorageId(uuid());
    const operation: RecordingOperation = {
      id: operationId,
      sessionId: validatedSessionId,
      operationKind: 'expire_recording',
      status: 'pending',
      createdAt: completedAt,
    };
    const operationResult: RecordingSessionOperationResult =
      await applyRecordingSessionOperationInTransaction(transaction, operation, {
        type: 'expire',
        at: completedAt,
      });
    if (operationResult.operation.status !== 'applied') {
      return null;
    }

    const chunkPaths = await transaction.getAllAsync<AudioChunkPathRow>(
      'SELECT id, encrypted_path FROM audio_chunks WHERE session_id = ? ORDER BY sequence',
      validatedSessionId,
    );
    for (const chunk of chunkPaths) {
      validateStorageId(chunk.id);
      if (typeof chunk.encrypted_path !== 'string' || chunk.encrypted_path.length === 0) {
        throw new CleanupError('Stored encrypted chunk path is invalid.');
      }
      await deleteFile(chunk.encrypted_path);
    }

    for (const statement of EXPIRY_DELETES) {
      await transaction.runAsync(statement, validatedSessionId);
    }

    const deletedKinds = [...CLEANUP_RECORD_KINDS];
    const receiptId = validateStorageId(uuid());
    const contentFreeHash = await hash(
      JSON.stringify({
        sessionId: validatedSessionId,
        reason: 'expired',
        completedAt,
        deletedKinds,
      }),
    );
    const receipt = validateCleanupReceipt({
      id: receiptId,
      sessionId: validatedSessionId,
      reason: 'expired',
      deletedKinds,
      completedAt,
      contentFreeHash,
      createdAt: completedAt,
    });

    await transaction.runAsync(
      `INSERT INTO cleanup_receipts
       (id, session_id, reason, deleted_kinds, completed_at, content_free_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      receipt.id,
      receipt.sessionId ?? null,
      receipt.reason,
      JSON.stringify(receipt.deletedKinds),
      receipt.completedAt,
      receipt.contentFreeHash,
    );

    return receipt;
  });
}

export const cleanupExpiredRecordingSession = cleanupExpiredSession;
export const runExpiryCleanup = cleanupExpiredSession;

export async function deleteAllData(
  database: CleanupDatabase,
  dependencies: CleanupDependencies = {},
): Promise<void> {
  const stopActiveCapture = dependencies.stopActiveCapture ?? (async () => undefined);
  const deleteFile = dependencies.deleteFile ?? defaultDeleteFile;

  await stopActiveCapture();
  invalidateStorageBootstrap();

  await withExclusiveTransaction(database, async (transaction) => {
    const chunkPaths = await transaction.getAllAsync<AudioChunkPathRow>(
      'SELECT id, encrypted_path FROM audio_chunks ORDER BY id',
    );
    for (const chunk of chunkPaths) {
      validateStorageId(chunk.id);
      if (typeof chunk.encrypted_path !== 'string' || chunk.encrypted_path.length === 0) {
        throw new CleanupError('Stored encrypted chunk path is invalid.');
      }
      await deleteFile(chunk.encrypted_path);
    }

    for (const statement of DELETE_ALL_STATEMENTS) {
      await transaction.runAsync(statement);
    }
  });

  await database.closeAsync();
  await (dependencies.deleteDatabase ?? defaultDeleteDatabase)(DATABASE_NAME);
  await deleteDatabaseKey(dependencies.secureKey);
}

async function withExclusiveTransaction<T>(
  database: MigrationDatabase,
  task: (transaction: MigrationTransaction) => Promise<T>,
): Promise<T> {
  let result!: T;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    result = await task(transaction);
  });
  return result;
}

function validateUtcTimestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(Date.parse(value)).toISOString() !== value
  ) {
    throw new CleanupError('Storage timestamp is invalid.');
  }
  return value;
}
