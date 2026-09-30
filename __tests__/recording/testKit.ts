// @ts-expect-error Node 22 provides this built-in, but the app's configured type list omits Node types.
import { createHash } from 'node:crypto';
// @ts-expect-error Node 22 provides this built-in, but the app's configured type list omits Node types.
import { DatabaseSync } from 'node:sqlite';

import type { PermissionResponse } from 'expo';
import type { SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';

import type { RecordingFiles } from '../../src/features/recording/files';
import type { RecordingNative, RecordingRecorder } from '../../src/features/recording/recorder';
import type { SQLiteDatabaseLike } from '../../src/storage/database';
import { applyMigrations } from '../../src/storage/migrations';
import {
  createStorageRepositories,
  type StorageRepositories,
} from '../../src/storage/repositories';
import type { RecordingSession, VoiceProfile } from '../../src/storage/types';

export type TestDatabase = SQLiteDatabaseLike & {
  native: DatabaseSync;
  failNextSessionWrite: boolean;
};

/** An in-memory SQLite that behaves like the expo-sqlite handle the repositories expect. */
export async function createMigratedDatabase(): Promise<TestDatabase> {
  const native = new DatabaseSync(':memory:');
  let exclusiveQueue = Promise.resolve();
  const database: TestDatabase = {
    native,
    failNextSessionWrite: false,
    execAsync: async (source: string) => {
      native.exec(source);
    },
    runAsync: async (source: string, ...params: SQLiteBindValue[]) => {
      if (database.failNextSessionWrite && source.includes('INSERT INTO recording_sessions')) {
        database.failNextSessionWrite = false;
        throw new Error('induced session write failure');
      }
      native.prepare(source).run(...params);
      return { changes: 0, lastInsertRowId: 0 } as SQLiteRunResult;
    },
    getFirstAsync: async <T>(source: string, ...params: SQLiteBindValue[]) => {
      const row = native.prepare(source).get(...params);
      return (row as T | undefined) ?? null;
    },
    getAllAsync: async <T>(source: string, ...params: SQLiteBindValue[]) => {
      return native.prepare(source).all(...params) as T[];
    },
    withExclusiveTransactionAsync: (task) => {
      const run = exclusiveQueue.then(async () => {
        native.exec('BEGIN');
        try {
          await task(database);
          native.exec('COMMIT');
        } catch (error) {
          native.exec('ROLLBACK');
          throw error;
        }
      });
      exclusiveQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    closeAsync: async () => {
      native.close();
    },
  };
  await applyMigrations(database);
  return database;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function bytesOf(text: string): Uint8Array {
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

export const SESSION_ID = '22222222-2222-4222-8222-222222222222';
export const VOICE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

export function uuidSequence(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  };
}

export function makeScheduledSession(overrides: Partial<RecordingSession> = {}): RecordingSession {
  return {
    id: SESSION_ID,
    scheduledStart: '2026-03-10T09:00:00.000Z',
    scheduledEnd: '2026-03-10T17:00:00.000Z',
    timezone: 'UTC',
    status: 'scheduled',
    pauseIntervals: [],
    createdAt: '2026-03-10T08:00:00.000Z',
    updatedAt: '2026-03-10T08:00:00.000Z',
    ...overrides,
  };
}

export function makeVoiceProfile(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    id: VOICE_ID,
    status: 'ready',
    sampleCount: 3,
    encryptedEmbeddingBlob: 'encrypted embedding',
    modelVersion: 'v1',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

export function permission(
  overrides: Partial<Omit<PermissionResponse, 'status'>> & {
    status?: 'granted' | 'denied' | 'undetermined';
  } = {},
): PermissionResponse {
  return {
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
    ...overrides,
  } as PermissionResponse;
}

/** Plaintext capture files on an imaginary device disk. */
export class FakeDisk {
  public readonly files = new Map<string, Uint8Array>();
  public freeBytes = 10 * 1024 * 1024 * 1024;
  public readonly log: string[];

  public constructor(log: string[]) {
    this.log = log;
  }

  public readonly recordingFiles: RecordingFiles = {
    readBytes: async (uri) => {
      const bytes = this.files.get(uri);
      if (bytes === undefined) {
        throw new Error('file is missing');
      }
      return bytes;
    },
    availableBytes: async () => this.freeBytes,
    sha256: async (bytes) => sha256Hex(bytes),
  };

  public readonly native: RecordingNative = {
    getRecordingPermissionsAsync: async () => permission(),
    requestRecordingPermissionsAsync: async () => permission(),
    setAudioModeAsync: async () => undefined,
    deleteFile: async (uri) => {
      this.log.push(`delete:${uri}`);
      this.files.delete(uri);
    },
  };
}

/** Each prepare allocates a new cache file; record() writes that chunk's bytes into it. */
export function createFakeRecorder(log: string[], disk: FakeDisk) {
  let count = 0;
  const recorder = {
    uri: null as string | null,
    /** Bytes written to the next chunk file when record() is called. */
    nextBytes: undefined as Uint8Array | undefined,
    prepareToRecordAsync: jest.fn(async () => {
      count += 1;
      recorder.uri = `file:///cache/chunk-${count}.m4a`;
      log.push(`prepare:${count}`);
    }),
    record: jest.fn(() => {
      log.push(`record:${count}`);
      if (recorder.uri !== null) {
        disk.files.set(recorder.uri, recorder.nextBytes ?? bytesOf(`audio-${count}`));
      }
    }),
    pause: jest.fn(),
    stop: jest.fn(async () => {
      log.push(`stop:${count}`);
    }),
  };
  return recorder as typeof recorder & RecordingRecorder;
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

/** Real repositories over an in-memory database, with the device edges faked. */
export async function createHarness() {
  const log: string[] = [];
  const database = await createMigratedDatabase();
  const repositories: StorageRepositories = createStorageRepositories(database);
  const commitSpy = jest.fn();
  const faults = { failCommits: 0 };
  const saveClosedAudioChunk = repositories.saveClosedAudioChunk;
  repositories.saveClosedAudioChunk = async (input) => {
    commitSpy(input);
    if (faults.failCommits > 0) {
      faults.failCommits -= 1;
      throw new Error('induced commit failure');
    }
    const result = await saveClosedAudioChunk(input);
    log.push(`commit:${input.chunk.sequence}`);
    return result;
  };
  const disk = new FakeDisk(log);
  const recorder = createFakeRecorder(log, disk);
  await repositories.voiceProfiles.save(makeVoiceProfile());
  await repositories.recordingSessions.save(makeScheduledSession());
  return { log, database, repositories, disk, recorder, commitSpy, faults };
}

export const T0 = new Date('2026-03-10T09:00:00.000Z');

/** Installs fake timers at T0 while leaving setImmediate real so tests can drain promise chains. */
export function useFakeClock(): void {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(T0);
}

/** Moves the fake clock forward, then waits for every promise chain the timers started. */
export async function advance(ms: number): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
  await new Promise<void>((resolve) => setImmediate(resolve));
}

export function isoAfter(ms: number): string {
  return new Date(T0.getTime() + ms).toISOString();
}
