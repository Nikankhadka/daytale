import type { SQLiteBindValue } from 'expo-sqlite';

import type { MigrationDatabase, MigrationTransaction } from './migrations';
import {
  recordingSessionReducer,
  type RecordingSessionAction,
} from '../state/recordingSessionReducer';
import {
  type AppPreferences,
  type AudioChunk,
  type ClarificationAnswer,
  type ClarificationQuestion,
  type CleanupReceipt,
  type ExtractedEvent,
  type JournalEntry,
  type RecordingOperation,
  type RecordingSession,
  type TranscriptSegment,
  type VoiceProfile,
  MAX_RETRY_WINDOW_MS,
  StorageValidationError,
  validateAppPreferences,
  validateAudioChunk,
  validateClarificationAnswer,
  validateClarificationQuestion,
  validateCleanupReceipt,
  validateExtractedEvent,
  validateJournalEntry,
  validateRecordingOperation,
  validateRecordingSession,
  validateStorageId,
  validateTranscriptSegment,
  validateVoiceProfile,
} from './types';

export class StorageRepositoryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'StorageRepositoryError';
  }
}

export type EntityRepository<T extends { id: string }> = {
  save: (value: T) => Promise<T>;
  getById: (id: string) => Promise<T | null>;
  findById: (id: string) => Promise<T | null>;
  list: () => Promise<T[]>;
};

export type RecordingSessionOperationResult = {
  operation: RecordingOperation;
  session: RecordingSession;
  duplicate: boolean;
};

export type StorageRepositories = {
  appPreferences: EntityRepository<AppPreferences>;
  voiceProfiles: EntityRepository<VoiceProfile>;
  recordingSessions: EntityRepository<RecordingSession>;
  audioChunks: EntityRepository<AudioChunk>;
  transcriptSegments: EntityRepository<TranscriptSegment>;
  extractedEvents: EntityRepository<ExtractedEvent>;
  clarificationQuestions: EntityRepository<ClarificationQuestion>;
  clarificationAnswers: EntityRepository<ClarificationAnswer>;
  journalEntries: EntityRepository<JournalEntry>;
  cleanupReceipts: EntityRepository<CleanupReceipt>;
  recordingOperations: EntityRepository<RecordingOperation>;
  applyRecordingSessionOperation: (
    operation: RecordingOperation,
    action: RecordingSessionAction,
  ) => Promise<RecordingSessionOperationResult>;
};

type SqlRow = Record<string, unknown>;

type RecordingSessionRow = SqlRow & {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string | null;
  actual_end: string | null;
  timezone: string;
  status: string;
  pause_intervals: string;
  last_recovered_chunk_id: string | null;
  failure_code: string | null;
  retry_until: string | null;
  retry_target: string | null;
  created_at: string;
  updated_at: string;
};

type AudioChunkRow = SqlRow & {
  id: string;
  session_id: string;
  sequence: number;
  started_at: string;
  ended_at: string | null;
  codec: string;
  sample_rate: number;
  encrypted_path: string;
  sha256: string;
  state: string;
  delete_after: string;
  created_at: string;
};

type OperationRow = SqlRow & {
  id: string;
  session_id: string;
  operation_kind: string;
  status: string;
  created_at: string;
  completed_at: string | null;
};

const APP_PREFERENCES_COLUMNS = `
  id, first_name, spoken_languages, journal_language, schedule_start_local,
  schedule_end_local, timezone, notifications_enabled, microphone_permission_state,
  onboarding_complete, onboarding_stage, theme, reduced_motion, created_at, updated_at`;
const VOICE_PROFILE_COLUMNS = `
  id, status, sample_count, encrypted_embedding_blob, model_version,
  created_at, updated_at, deleted_at`;
const RECORDING_SESSION_COLUMNS = `
  id, scheduled_start, scheduled_end, actual_start, actual_end, timezone, status,
  pause_intervals, last_recovered_chunk_id, failure_code, retry_until,
  retry_target, created_at, updated_at`;
const AUDIO_CHUNK_COLUMNS = `
  id, session_id, sequence, started_at, ended_at, codec, sample_rate,
  encrypted_path, sha256, state, delete_after, created_at`;
const TRANSCRIPT_SEGMENT_COLUMNS = `
  id, session_id, chunk_id, start_ms, end_ms, text, language, speaker,
  speaker_confidence, transcript_confidence, created_at`;
const EXTRACTED_EVENT_COLUMNS = `
  id, session_id, start_ms, end_ms, kind, summary, evidence_segment_ids,
  speaker, confidence, supported, created_at`;
const CLARIFICATION_QUESTION_COLUMNS = `
  id, session_id, start_ms, end_ms, question, reason, status, created_at`;
const CLARIFICATION_ANSWER_COLUMNS = `id, question_id, answer_text, created_at`;
const JOURNAL_ENTRY_COLUMNS = `
  id, session_id, date, timezone, title, paragraphs, context_tags,
  source_event_ids, language, edited_at, created_at, updated_at`;
const CLEANUP_RECEIPT_COLUMNS = `
  id, session_id, reason, deleted_kinds, completed_at, content_free_hash`;
const RECORDING_OPERATION_COLUMNS =
  'id, session_id, operation_kind, status, created_at, completed_at';

const ORDER_BY_ID = ' ORDER BY id';

export function createStorageRepositories(database: MigrationDatabase): StorageRepositories {
  return {
    appPreferences: createEntityRepository(
      (value) => saveAppPreferences(database, value),
      (id) => getAppPreferences(database, id),
      () => listAppPreferences(database),
    ),
    voiceProfiles: createEntityRepository(
      (value) => saveVoiceProfile(database, value),
      (id) => getVoiceProfile(database, id),
      () => listVoiceProfiles(database),
    ),
    recordingSessions: createEntityRepository(
      (value) => saveRecordingSession(database, value),
      (id) => getRecordingSession(database, id),
      () => listRecordingSessions(database),
    ),
    audioChunks: createEntityRepository(
      (value) => saveAudioChunk(database, value),
      (id) => getAudioChunk(database, id),
      () => listAudioChunks(database),
    ),
    transcriptSegments: createEntityRepository(
      (value) => saveTranscriptSegment(database, value),
      (id) => getTranscriptSegment(database, id),
      () => listTranscriptSegments(database),
    ),
    extractedEvents: createEntityRepository(
      (value) => saveExtractedEvent(database, value),
      (id) => getExtractedEvent(database, id),
      () => listExtractedEvents(database),
    ),
    clarificationQuestions: createEntityRepository(
      (value) => saveClarificationQuestion(database, value),
      (id) => getClarificationQuestion(database, id),
      () => listClarificationQuestions(database),
    ),
    clarificationAnswers: createEntityRepository(
      (value) => saveClarificationAnswer(database, value),
      (id) => getClarificationAnswer(database, id),
      () => listClarificationAnswers(database),
    ),
    journalEntries: createEntityRepository(
      (value) => saveJournalEntry(database, value),
      (id) => getJournalEntry(database, id),
      () => listJournalEntries(database),
    ),
    cleanupReceipts: createEntityRepository(
      (value) => saveCleanupReceipt(database, value),
      (id) => getCleanupReceipt(database, id),
      () => listCleanupReceipts(database),
    ),
    recordingOperations: createEntityRepository(
      (value) => saveRecordingOperation(database, value),
      (id) => getRecordingOperation(database, id),
      () => listRecordingOperations(database),
    ),
    applyRecordingSessionOperation: (operation, action) =>
      applyRecordingSessionOperation(database, operation, action),
  };
}

export const createRepositories = createStorageRepositories;

export async function saveAppPreferences(
  database: MigrationDatabase,
  value: AppPreferences,
): Promise<AppPreferences> {
  const record = validateAppPreferences(value);
  await writeAppPreferences(database, record);
  return record;
}

export async function getAppPreferences(
  database: MigrationDatabase,
  id: string,
): Promise<AppPreferences | null> {
  const row = await database.getFirstAsync<SqlRow>(
    `SELECT ${APP_PREFERENCES_COLUMNS} FROM app_preferences WHERE id = ?`,
    validateStorageId(id),
  );
  return row === null ? null : mapAppPreferences(row);
}

export async function listAppPreferences(database: MigrationDatabase): Promise<AppPreferences[]> {
  const rows = await database.getAllAsync<SqlRow>(
    `SELECT ${APP_PREFERENCES_COLUMNS} FROM app_preferences${ORDER_BY_ID}`,
  );
  return rows.map(mapAppPreferences);
}

export async function saveVoiceProfile(
  database: MigrationDatabase,
  value: VoiceProfile,
): Promise<VoiceProfile> {
  const record = validateVoiceProfile(value);
  await writeVoiceProfile(database, record);
  return record;
}

export async function getVoiceProfile(
  database: MigrationDatabase,
  id: string,
): Promise<VoiceProfile | null> {
  const row = await database.getFirstAsync<SqlRow>(
    `SELECT ${VOICE_PROFILE_COLUMNS} FROM voice_profiles WHERE id = ?`,
    validateStorageId(id),
  );
  return row === null ? null : mapVoiceProfile(row);
}

export async function listVoiceProfiles(database: MigrationDatabase): Promise<VoiceProfile[]> {
  const rows = await database.getAllAsync<SqlRow>(
    `SELECT ${VOICE_PROFILE_COLUMNS} FROM voice_profiles${ORDER_BY_ID}`,
  );
  return rows.map(mapVoiceProfile);
}

export async function saveRecordingSession(
  database: MigrationDatabase,
  value: RecordingSession,
): Promise<RecordingSession> {
  const record = validateRecordingSession(value);
  await withExclusiveTransaction(database, async (transaction) => {
    await writeRecordingSession(transaction, record);
  });
  return record;
}

export async function getRecordingSession(
  database: MigrationDatabase,
  id: string,
): Promise<RecordingSession | null> {
  return getRecordingSessionFrom(database, id);
}

export async function listRecordingSessions(
  database: MigrationDatabase,
): Promise<RecordingSession[]> {
  const rows = await database.getAllAsync<RecordingSessionRow>(
    `SELECT ${RECORDING_SESSION_COLUMNS} FROM recording_sessions${ORDER_BY_ID}`,
  );
  return rows.map((row) => mapRecordingSession(row));
}

export async function saveAudioChunk(
  database: MigrationDatabase,
  value: AudioChunk,
): Promise<AudioChunk> {
  const record = validateAudioChunk(value);
  await writeAudioChunk(database, record);
  return record;
}

export async function getAudioChunk(
  database: MigrationDatabase,
  id: string,
): Promise<AudioChunk | null> {
  const row = await database.getFirstAsync<AudioChunkRow>(
    `SELECT ${AUDIO_CHUNK_COLUMNS} FROM audio_chunks WHERE id = ?`,
    validateStorageId(id),
  );
  return row === null ? null : mapAudioChunk(row);
}

export async function listAudioChunks(database: MigrationDatabase): Promise<AudioChunk[]> {
  const rows = await database.getAllAsync<AudioChunkRow>(
    `SELECT ${AUDIO_CHUNK_COLUMNS} FROM audio_chunks${ORDER_BY_ID}`,
  );
  return rows.map(mapAudioChunk);
}

export async function saveTranscriptSegment(
  database: MigrationDatabase,
  value: TranscriptSegment,
): Promise<TranscriptSegment> {
  const record = validateTranscriptSegment(value);
  await writeTranscriptSegment(database, record);
  return record;
}

export async function getTranscriptSegment(
  database: MigrationDatabase,
  id: string,
): Promise<TranscriptSegment | null> {
  const row = await database.getFirstAsync<SqlRow>(
    `SELECT ${TRANSCRIPT_SEGMENT_COLUMNS} FROM transcript_segments WHERE id = ?`,
    validateStorageId(id),
  );
  return row === null ? null : mapTranscriptSegment(row);
}

export async function listTranscriptSegments(
  database: MigrationDatabase,
): Promise<TranscriptSegment[]> {
  const rows = await database.getAllAsync<SqlRow>(
    `SELECT ${TRANSCRIPT_SEGMENT_COLUMNS} FROM transcript_segments${ORDER_BY_ID}`,
  );
  return rows.map(mapTranscriptSegment);
}

export async function saveExtractedEvent(
  database: MigrationDatabase,
  value: ExtractedEvent,
): Promise<ExtractedEvent> {
  const record = validateExtractedEvent(value);
  await withExclusiveTransaction(database, async (transaction) => {
    await writeExtractedEvent(transaction, record);
  });
  return record;
}

export async function getExtractedEvent(
  database: MigrationDatabase,
  id: string,
): Promise<ExtractedEvent | null> {
  const row = await database.getFirstAsync<SqlRow>(
    `SELECT ${EXTRACTED_EVENT_COLUMNS} FROM extracted_events WHERE id = ?`,
    validateStorageId(id),
  );
  return row === null ? null : mapExtractedEvent(row);
}

export async function listExtractedEvents(database: MigrationDatabase): Promise<ExtractedEvent[]> {
  const rows = await database.getAllAsync<SqlRow>(
    `SELECT ${EXTRACTED_EVENT_COLUMNS} FROM extracted_events${ORDER_BY_ID}`,
  );
  return rows.map(mapExtractedEvent);
}

export async function saveClarificationQuestion(
  database: MigrationDatabase,
  value: ClarificationQuestion,
): Promise<ClarificationQuestion> {
  const record = validateClarificationQuestion(value);
  await withExclusiveTransaction(database, async (transaction) => {
    await writeClarificationQuestion(transaction, record);
  });
  return record;
}

export async function getClarificationQuestion(
  database: MigrationDatabase,
  id: string,
): Promise<ClarificationQuestion | null> {
  const row = await database.getFirstAsync<SqlRow>(
    `SELECT ${CLARIFICATION_QUESTION_COLUMNS} FROM clarification_questions WHERE id = ?`,
    validateStorageId(id),
  );
  return row === null ? null : mapClarificationQuestion(row);
}

export async function listClarificationQuestions(
  database: MigrationDatabase,
): Promise<ClarificationQuestion[]> {
  const rows = await database.getAllAsync<SqlRow>(
    `SELECT ${CLARIFICATION_QUESTION_COLUMNS} FROM clarification_questions${ORDER_BY_ID}`,
  );
  return rows.map(mapClarificationQuestion);
}

export async function saveClarificationAnswer(
  database: MigrationDatabase,
  value: ClarificationAnswer,
): Promise<ClarificationAnswer> {
  const record = validateClarificationAnswer(value);
  await writeClarificationAnswer(database, record);
  return record;
}

export async function getClarificationAnswer(
  database: MigrationDatabase,
  id: string,
): Promise<ClarificationAnswer | null> {
  const row = await database.getFirstAsync<SqlRow>(
    `SELECT ${CLARIFICATION_ANSWER_COLUMNS} FROM clarification_answers WHERE id = ?`,
    validateStorageId(id),
  );
  return row === null ? null : mapClarificationAnswer(row);
}

export async function listClarificationAnswers(
  database: MigrationDatabase,
): Promise<ClarificationAnswer[]> {
  const rows = await database.getAllAsync<SqlRow>(
    `SELECT ${CLARIFICATION_ANSWER_COLUMNS} FROM clarification_answers${ORDER_BY_ID}`,
  );
  return rows.map(mapClarificationAnswer);
}

export async function saveJournalEntry(
  database: MigrationDatabase,
  value: JournalEntry,
): Promise<JournalEntry> {
  const record = validateJournalEntry(value);
  await withExclusiveTransaction(database, async (transaction) => {
    await writeJournalEntry(transaction, record);
  });
  return record;
}

export async function getJournalEntry(
  database: MigrationDatabase,
  id: string,
): Promise<JournalEntry | null> {
  const row = await database.getFirstAsync<SqlRow>(
    `SELECT ${JOURNAL_ENTRY_COLUMNS} FROM journal_entries WHERE id = ?`,
    validateStorageId(id),
  );
  return row === null ? null : mapJournalEntry(row);
}

export async function listJournalEntries(database: MigrationDatabase): Promise<JournalEntry[]> {
  const rows = await database.getAllAsync<SqlRow>(
    `SELECT ${JOURNAL_ENTRY_COLUMNS} FROM journal_entries${ORDER_BY_ID}`,
  );
  return rows.map(mapJournalEntry);
}

export async function saveCleanupReceipt(
  database: MigrationDatabase,
  value: CleanupReceipt,
): Promise<CleanupReceipt> {
  const record = normalizedCleanupReceipt(value);
  await writeCleanupReceipt(database, record);
  return record;
}

export async function getCleanupReceipt(
  database: MigrationDatabase,
  id: string,
): Promise<CleanupReceipt | null> {
  const row = await database.getFirstAsync<SqlRow>(
    `SELECT ${CLEANUP_RECEIPT_COLUMNS} FROM cleanup_receipts WHERE id = ?`,
    validateStorageId(id),
  );
  return row === null ? null : mapCleanupReceipt(row);
}

export async function listCleanupReceipts(database: MigrationDatabase): Promise<CleanupReceipt[]> {
  const rows = await database.getAllAsync<SqlRow>(
    `SELECT ${CLEANUP_RECEIPT_COLUMNS} FROM cleanup_receipts${ORDER_BY_ID}`,
  );
  return rows.map(mapCleanupReceipt);
}

export async function saveRecordingOperation(
  database: MigrationDatabase,
  value: RecordingOperation,
): Promise<RecordingOperation> {
  const record = validateRecordingOperation(value);
  await writeRecordingOperation(database, record);
  return record;
}

export async function getRecordingOperation(
  database: MigrationDatabase,
  id: string,
): Promise<RecordingOperation | null> {
  const row = await database.getFirstAsync<OperationRow>(
    `SELECT ${RECORDING_OPERATION_COLUMNS} FROM recording_operations WHERE id = ?`,
    validateStorageId(id),
  );
  return row === null ? null : mapRecordingOperation(row);
}

export async function listRecordingOperations(
  database: MigrationDatabase,
): Promise<RecordingOperation[]> {
  const rows = await database.getAllAsync<OperationRow>(
    `SELECT ${RECORDING_OPERATION_COLUMNS} FROM recording_operations${ORDER_BY_ID}`,
  );
  return rows.map(mapRecordingOperation);
}

export async function applyRecordingSessionOperation(
  database: MigrationDatabase,
  operation: RecordingOperation,
  action: RecordingSessionAction,
): Promise<RecordingSessionOperationResult> {
  return withExclusiveTransaction(database, (transaction) =>
    applyRecordingSessionOperationInTransaction(transaction, operation, action),
  );
}

export async function applyRecordingSessionOperationInTransaction(
  transaction: MigrationTransaction,
  operation: RecordingOperation,
  action: RecordingSessionAction,
): Promise<RecordingSessionOperationResult> {
  const requested = validateRecordingOperation(operation);
  if (requested.status !== 'pending') {
    throw new StorageValidationError('status');
  }

  const normalizeExpiredRetryMetadata = action.type === 'expire';
  const prior = await getRecordingOperationFrom(transaction, requested.id);
  if (prior !== null) {
    if (
      prior.sessionId !== requested.sessionId ||
      prior.operationKind !== requested.operationKind
    ) {
      throw new StorageRepositoryError('Operation identity conflicts with its persisted record.');
    }
    const session = await getRecordingSessionFrom(transaction, prior.sessionId, {
      normalizeExpiredRetryMetadata,
    });
    if (session === null) {
      throw new StorageRepositoryError('Persisted operation has no owning session.');
    }
    return { operation: prior, session, duplicate: true };
  }

  const current = await getRecordingSessionFrom(transaction, requested.sessionId, {
    normalizeExpiredRetryMetadata,
  });
  if (current === null) {
    throw new StorageRepositoryError('Cannot apply an operation to a missing session.');
  }

  const next = recordingSessionReducer(current, action);
  if (next === null) {
    const rejected = validateRecordingOperation({
      ...requested,
      status: 'rejected',
      completedAt: requested.completedAt ?? current.updatedAt,
    });
    await writeRecordingOperation(transaction, rejected);
    return { operation: rejected, session: current, duplicate: false };
  }

  const nextSession = validateRecordingSession(next);
  if (nextSession.id !== current.id) {
    throw new StorageRepositoryError('A session operation cannot replace its session identity.');
  }
  await writeRecordingSession(transaction, nextSession);

  const applied = validateRecordingOperation({
    ...requested,
    status: 'applied',
    completedAt: requested.completedAt ?? nextSession.updatedAt,
  });
  await writeRecordingOperation(transaction, applied);
  return { operation: applied, session: nextSession, duplicate: false };
}

function createEntityRepository<T extends { id: string }>(
  save: (value: T) => Promise<T>,
  getById: (id: string) => Promise<T | null>,
  list: () => Promise<T[]>,
): EntityRepository<T> {
  return { save, getById, findById: getById, list };
}

async function writeAppPreferences(
  database: MigrationTransaction,
  record: AppPreferences,
): Promise<void> {
  await run(
    database,
    `
    INSERT INTO app_preferences (
      id, first_name, spoken_languages, journal_language, schedule_start_local,
      schedule_end_local, timezone, notifications_enabled, microphone_permission_state,
      onboarding_complete, onboarding_stage, theme, reduced_motion, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      first_name = excluded.first_name,
      spoken_languages = excluded.spoken_languages,
      journal_language = excluded.journal_language,
      schedule_start_local = excluded.schedule_start_local,
      schedule_end_local = excluded.schedule_end_local,
      timezone = excluded.timezone,
      notifications_enabled = excluded.notifications_enabled,
      microphone_permission_state = excluded.microphone_permission_state,
      onboarding_complete = excluded.onboarding_complete,
      onboarding_stage = excluded.onboarding_stage,
      theme = excluded.theme,
      reduced_motion = excluded.reduced_motion,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
    record.id,
    nullable(record.firstName),
    json(record.spokenLanguages),
    record.journalLanguage,
    record.scheduleStartLocal,
    record.scheduleEndLocal,
    record.timezone,
    sqliteBoolean(record.notificationsEnabled),
    record.microphonePermissionState,
    sqliteBoolean(record.onboardingComplete),
    record.onboardingStage,
    record.theme,
    sqliteBoolean(record.reducedMotion),
    record.createdAt,
    record.updatedAt,
  );
}

async function writeVoiceProfile(
  database: MigrationTransaction,
  record: VoiceProfile,
): Promise<void> {
  await run(
    database,
    `
    INSERT INTO voice_profiles (
      id, status, sample_count, encrypted_embedding_blob, model_version,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      sample_count = excluded.sample_count,
      encrypted_embedding_blob = excluded.encrypted_embedding_blob,
      model_version = excluded.model_version,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at`,
    record.id,
    record.status,
    record.sampleCount,
    record.encryptedEmbeddingBlob,
    record.modelVersion,
    record.createdAt,
    record.updatedAt,
    nullable(record.deletedAt),
  );
}

async function writeRecordingSession(
  database: MigrationTransaction,
  record: RecordingSession,
): Promise<void> {
  if (record.lastRecoveredChunkId !== undefined) {
    await assertChunkBelongsToSession(database, record.lastRecoveredChunkId, record.id);
  }
  await run(
    database,
    `
    INSERT INTO recording_sessions (
      id, scheduled_start, scheduled_end, actual_start, actual_end, timezone, status,
      pause_intervals, last_recovered_chunk_id, failure_code, retry_until, retry_target,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      scheduled_start = excluded.scheduled_start,
      scheduled_end = excluded.scheduled_end,
      actual_start = excluded.actual_start,
      actual_end = excluded.actual_end,
      timezone = excluded.timezone,
      status = excluded.status,
      pause_intervals = excluded.pause_intervals,
      last_recovered_chunk_id = excluded.last_recovered_chunk_id,
      failure_code = excluded.failure_code,
      retry_until = excluded.retry_until,
      retry_target = excluded.retry_target,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
    record.id,
    record.scheduledStart,
    record.scheduledEnd,
    nullable(record.actualStart),
    nullable(record.actualEnd),
    record.timezone,
    record.status,
    json(record.pauseIntervals),
    nullable(record.lastRecoveredChunkId),
    nullable(record.failureCode),
    nullable(record.retryUntil),
    nullable(record.retryTarget),
    record.createdAt,
    record.updatedAt,
  );
}

async function writeAudioChunk(database: MigrationTransaction, record: AudioChunk): Promise<void> {
  await assertSessionExists(database, record.sessionId);
  await run(
    database,
    `
    INSERT INTO audio_chunks (
      id, session_id, sequence, started_at, ended_at, codec, sample_rate,
      encrypted_path, sha256, state, delete_after, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      session_id = excluded.session_id,
      sequence = excluded.sequence,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      codec = excluded.codec,
      sample_rate = excluded.sample_rate,
      encrypted_path = excluded.encrypted_path,
      sha256 = excluded.sha256,
      state = excluded.state,
      delete_after = excluded.delete_after,
      created_at = excluded.created_at`,
    record.id,
    record.sessionId,
    record.sequence,
    record.startedAt,
    nullable(record.endedAt),
    record.codec,
    record.sampleRate,
    record.encryptedPath,
    record.sha256,
    record.state,
    record.deleteAfter,
    record.createdAt,
  );
}

async function writeTranscriptSegment(
  database: MigrationTransaction,
  record: TranscriptSegment,
): Promise<void> {
  await assertChunkBelongsToSession(database, record.chunkId, record.sessionId);
  await run(
    database,
    `
    INSERT INTO transcript_segments (
      id, session_id, chunk_id, start_ms, end_ms, text, language, speaker,
      speaker_confidence, transcript_confidence, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      session_id = excluded.session_id,
      chunk_id = excluded.chunk_id,
      start_ms = excluded.start_ms,
      end_ms = excluded.end_ms,
      text = excluded.text,
      language = excluded.language,
      speaker = excluded.speaker,
      speaker_confidence = excluded.speaker_confidence,
      transcript_confidence = excluded.transcript_confidence,
      created_at = excluded.created_at`,
    record.id,
    record.sessionId,
    record.chunkId,
    record.startMs,
    record.endMs,
    record.text,
    record.language,
    record.speaker,
    record.speakerConfidence,
    record.transcriptConfidence,
    record.createdAt,
  );
}

async function writeExtractedEvent(
  database: MigrationTransaction,
  record: ExtractedEvent,
): Promise<void> {
  await assertSessionExists(database, record.sessionId);
  for (const segmentId of record.evidenceSegmentIds) {
    await assertTranscriptSegmentBelongsToSession(database, segmentId, record.sessionId);
  }
  await run(
    database,
    `
    INSERT INTO extracted_events (
      id, session_id, start_ms, end_ms, kind, summary, evidence_segment_ids,
      speaker, confidence, supported, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      session_id = excluded.session_id,
      start_ms = excluded.start_ms,
      end_ms = excluded.end_ms,
      kind = excluded.kind,
      summary = excluded.summary,
      evidence_segment_ids = excluded.evidence_segment_ids,
      speaker = excluded.speaker,
      confidence = excluded.confidence,
      supported = excluded.supported,
      created_at = excluded.created_at`,
    record.id,
    record.sessionId,
    record.startMs,
    record.endMs,
    record.kind,
    record.summary,
    json(record.evidenceSegmentIds),
    record.speaker,
    record.confidence,
    sqliteBoolean(record.supported),
    record.createdAt,
  );
}

async function writeClarificationQuestion(
  database: MigrationTransaction,
  record: ClarificationQuestion,
): Promise<void> {
  await assertSessionExists(database, record.sessionId);
  if (record.status === 'open') {
    const row = await database.getFirstAsync<{ count: number }>(
      `SELECT count(*) AS count
       FROM clarification_questions
       WHERE session_id = ? AND status = 'open' AND id <> ?`,
      record.sessionId,
      record.id,
    );
    if ((row?.count ?? 0) >= 2) {
      throw new StorageRepositoryError('A session cannot have more than two open questions.');
    }
  }
  await run(
    database,
    `
    INSERT INTO clarification_questions (
      id, session_id, start_ms, end_ms, question, reason, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      session_id = excluded.session_id,
      start_ms = excluded.start_ms,
      end_ms = excluded.end_ms,
      question = excluded.question,
      reason = excluded.reason,
      status = excluded.status,
      created_at = excluded.created_at`,
    record.id,
    record.sessionId,
    record.startMs,
    record.endMs,
    record.question,
    record.reason,
    record.status,
    record.createdAt,
  );
}

async function writeClarificationAnswer(
  database: MigrationTransaction,
  record: ClarificationAnswer,
): Promise<void> {
  const question = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM clarification_questions WHERE id = ?',
    validateStorageId(record.questionId),
  );
  if (question === null) {
    throw new StorageRepositoryError('Cannot save an answer for a missing question.');
  }
  await run(
    database,
    `
    INSERT INTO clarification_answers (id, question_id, answer_text, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      question_id = excluded.question_id,
      answer_text = excluded.answer_text,
      created_at = excluded.created_at`,
    record.id,
    record.questionId,
    record.answerText,
    record.createdAt,
  );
}

async function writeJournalEntry(
  database: MigrationTransaction,
  record: JournalEntry,
): Promise<void> {
  await assertSessionExists(database, record.sessionId);
  for (const eventId of record.sourceEventIds) {
    await assertExtractedEventBelongsToSession(database, eventId, record.sessionId);
  }
  await run(
    database,
    `
    INSERT INTO journal_entries (
      id, session_id, date, timezone, title, paragraphs, context_tags,
      source_event_ids, language, edited_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      session_id = excluded.session_id,
      date = excluded.date,
      timezone = excluded.timezone,
      title = excluded.title,
      paragraphs = excluded.paragraphs,
      context_tags = excluded.context_tags,
      source_event_ids = excluded.source_event_ids,
      language = excluded.language,
      edited_at = excluded.edited_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
    record.id,
    record.sessionId,
    record.date,
    record.timezone,
    record.title,
    json(record.paragraphs),
    json(record.contextTags),
    json(record.sourceEventIds),
    record.language,
    nullable(record.editedAt),
    record.createdAt,
    record.updatedAt,
  );
}

async function writeCleanupReceipt(
  database: MigrationTransaction,
  record: CleanupReceipt,
): Promise<void> {
  if (record.sessionId !== undefined) {
    await assertSessionExists(database, record.sessionId);
  }
  await run(
    database,
    `
    INSERT INTO cleanup_receipts (
      id, session_id, reason, deleted_kinds, completed_at, content_free_hash
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      session_id = excluded.session_id,
      reason = excluded.reason,
      deleted_kinds = excluded.deleted_kinds,
      completed_at = excluded.completed_at,
      content_free_hash = excluded.content_free_hash`,
    record.id,
    nullable(record.sessionId),
    record.reason,
    json(record.deletedKinds),
    record.completedAt,
    record.contentFreeHash,
  );
}

async function writeRecordingOperation(
  database: MigrationTransaction,
  record: RecordingOperation,
): Promise<void> {
  await assertSessionExists(database, record.sessionId);
  await run(
    database,
    `
    INSERT INTO recording_operations (
      id, session_id, operation_kind, status, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    record.id,
    record.sessionId,
    record.operationKind,
    record.status,
    record.createdAt,
    nullable(record.completedAt),
  );
}

async function getRecordingSessionFrom(
  database: MigrationTransaction,
  id: string,
  options: { normalizeExpiredRetryMetadata?: boolean } = {},
): Promise<RecordingSession | null> {
  const row = await database.getFirstAsync<RecordingSessionRow>(
    `SELECT ${RECORDING_SESSION_COLUMNS} FROM recording_sessions WHERE id = ?`,
    validateStorageId(id),
  );
  return row === null ? null : mapRecordingSession(row, options);
}

async function getRecordingOperationFrom(
  database: MigrationTransaction,
  id: string,
): Promise<RecordingOperation | null> {
  const row = await database.getFirstAsync<OperationRow>(
    `SELECT ${RECORDING_OPERATION_COLUMNS} FROM recording_operations WHERE id = ?`,
    validateStorageId(id),
  );
  return row === null ? null : mapRecordingOperation(row);
}

async function assertSessionExists(database: MigrationTransaction, id: string): Promise<void> {
  const row = await database.getFirstAsync<{ id: string }>(
    'SELECT id FROM recording_sessions WHERE id = ?',
    validateStorageId(id),
  );
  if (row === null) {
    throw new StorageRepositoryError('Referenced recording session does not exist.');
  }
}

async function assertChunkBelongsToSession(
  database: MigrationTransaction,
  chunkId: string,
  sessionId: string,
): Promise<void> {
  const row = await database.getFirstAsync<{ session_id: string }>(
    'SELECT session_id FROM audio_chunks WHERE id = ?',
    validateStorageId(chunkId),
  );
  if (row === null || row.session_id !== sessionId) {
    throw new StorageRepositoryError('Referenced audio chunk does not belong to the session.');
  }
}

async function assertTranscriptSegmentBelongsToSession(
  database: MigrationTransaction,
  segmentId: string,
  sessionId: string,
): Promise<void> {
  const row = await database.getFirstAsync<{ session_id: string }>(
    'SELECT session_id FROM transcript_segments WHERE id = ?',
    validateStorageId(segmentId),
  );
  if (row === null || row.session_id !== sessionId) {
    throw new StorageRepositoryError(
      'Referenced transcript segment does not belong to the session.',
    );
  }
}

async function assertExtractedEventBelongsToSession(
  database: MigrationTransaction,
  eventId: string,
  sessionId: string,
): Promise<void> {
  const row = await database.getFirstAsync<{ session_id: string }>(
    'SELECT session_id FROM extracted_events WHERE id = ?',
    validateStorageId(eventId),
  );
  if (row === null || row.session_id !== sessionId) {
    throw new StorageRepositoryError('Referenced extracted event does not belong to the session.');
  }
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

async function run(
  database: MigrationTransaction,
  source: string,
  ...params: SQLiteBindValue[]
): Promise<void> {
  await database.runAsync(source, ...params);
}

function nullable(value: string | undefined): string | null {
  return value ?? null;
}

function sqliteBoolean(value: boolean): number {
  return value ? 1 : 0;
}

function json(value: readonly unknown[]): string {
  return JSON.stringify(value);
}

function jsonArray(value: unknown, field: string): unknown[] {
  if (typeof value !== 'string') {
    throw new StorageValidationError(field);
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new Error('not an array');
    }
    return parsed;
  } catch {
    throw new StorageValidationError(field);
  }
}

function optionalText(value: unknown): string | undefined {
  return value === null ? undefined : (value as string);
}

function sqliteBooleanValue(value: unknown, field: string): boolean {
  if (value === 0 || value === false) {
    return false;
  }
  if (value === 1 || value === true) {
    return true;
  }
  throw new StorageValidationError(field);
}

function mapAppPreferences(row: SqlRow): AppPreferences {
  return validateAppPreferences({
    id: row.id,
    firstName: optionalText(row.first_name),
    spokenLanguages: jsonArray(row.spoken_languages, 'spokenLanguages'),
    journalLanguage: row.journal_language,
    scheduleStartLocal: row.schedule_start_local,
    scheduleEndLocal: row.schedule_end_local,
    timezone: row.timezone,
    notificationsEnabled: sqliteBooleanValue(row.notifications_enabled, 'notificationsEnabled'),
    microphonePermissionState: row.microphone_permission_state,
    onboardingComplete: sqliteBooleanValue(row.onboarding_complete, 'onboardingComplete'),
    onboardingStage: row.onboarding_stage,
    theme: row.theme,
    reducedMotion: sqliteBooleanValue(row.reduced_motion, 'reducedMotion'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapVoiceProfile(row: SqlRow): VoiceProfile {
  return validateVoiceProfile({
    id: row.id,
    status: row.status,
    sampleCount: row.sample_count,
    encryptedEmbeddingBlob: row.encrypted_embedding_blob,
    modelVersion: row.model_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: optionalText(row.deleted_at),
  });
}

function mapRecordingSession(
  row: RecordingSessionRow,
  options: { normalizeExpiredRetryMetadata?: boolean } = {},
): RecordingSession {
  const retryTarget = optionalText(row.retry_target);
  const retryUntil = optionalText(row.retry_until);
  return validateRecordingSession({
    id: row.id,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    actualStart: optionalText(row.actual_start),
    actualEnd: optionalText(row.actual_end),
    timezone: row.timezone,
    status: row.status,
    pauseIntervals: jsonArray(row.pause_intervals, 'pauseIntervals'),
    lastRecoveredChunkId: optionalText(row.last_recovered_chunk_id),
    failureCode: optionalText(row.failure_code),
    retryUntil:
      options.normalizeExpiredRetryMetadata && retryTarget === undefined
        ? undefined
        : options.normalizeExpiredRetryMetadata
          ? normalizeExpiredRetryUntil(retryUntil, row.updated_at)
          : retryUntil,
    retryTarget,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function normalizeExpiredRetryUntil(
  retryUntil: string | undefined,
  updatedAt: string,
): string | undefined {
  if (retryUntil === undefined) {
    return undefined;
  }
  const retryUntilMs = Date.parse(retryUntil);
  const updatedAtMs = Date.parse(updatedAt);
  if (Number.isNaN(retryUntilMs) || Number.isNaN(updatedAtMs)) {
    return retryUntil;
  }
  const effectiveDeadline = Math.min(retryUntilMs, updatedAtMs + MAX_RETRY_WINDOW_MS);
  return new Date(Math.max(updatedAtMs, effectiveDeadline)).toISOString();
}

function mapAudioChunk(row: AudioChunkRow): AudioChunk {
  return validateAudioChunk({
    id: row.id,
    sessionId: row.session_id,
    sequence: row.sequence,
    startedAt: row.started_at,
    endedAt: optionalText(row.ended_at),
    codec: row.codec,
    sampleRate: row.sample_rate,
    encryptedPath: row.encrypted_path,
    sha256: row.sha256,
    state: row.state,
    deleteAfter: row.delete_after,
    createdAt: row.created_at,
  });
}

function mapTranscriptSegment(row: SqlRow): TranscriptSegment {
  return validateTranscriptSegment({
    id: row.id,
    sessionId: row.session_id,
    chunkId: row.chunk_id,
    startMs: row.start_ms,
    endMs: row.end_ms,
    text: row.text,
    language: row.language,
    speaker: row.speaker,
    speakerConfidence: row.speaker_confidence,
    transcriptConfidence: row.transcript_confidence,
    createdAt: row.created_at,
  });
}

function mapExtractedEvent(row: SqlRow): ExtractedEvent {
  return validateExtractedEvent({
    id: row.id,
    sessionId: row.session_id,
    startMs: row.start_ms,
    endMs: row.end_ms,
    kind: row.kind,
    summary: row.summary,
    evidenceSegmentIds: jsonArray(row.evidence_segment_ids, 'evidenceSegmentIds'),
    speaker: row.speaker,
    confidence: row.confidence,
    supported: sqliteBooleanValue(row.supported, 'supported'),
    createdAt: row.created_at,
  });
}

function mapClarificationQuestion(row: SqlRow): ClarificationQuestion {
  return validateClarificationQuestion({
    id: row.id,
    sessionId: row.session_id,
    startMs: row.start_ms,
    endMs: row.end_ms,
    question: row.question,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  });
}

function mapClarificationAnswer(row: SqlRow): ClarificationAnswer {
  return validateClarificationAnswer({
    id: row.id,
    questionId: row.question_id,
    answerText: row.answer_text,
    createdAt: row.created_at,
  });
}

function mapJournalEntry(row: SqlRow): JournalEntry {
  return validateJournalEntry({
    id: row.id,
    sessionId: row.session_id,
    date: row.date,
    timezone: row.timezone,
    title: row.title,
    paragraphs: jsonArray(row.paragraphs, 'paragraphs'),
    contextTags: jsonArray(row.context_tags, 'contextTags'),
    sourceEventIds: jsonArray(row.source_event_ids, 'sourceEventIds'),
    language: row.language,
    editedAt: optionalText(row.edited_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapCleanupReceipt(row: SqlRow): CleanupReceipt {
  return normalizedCleanupReceipt({
    id: row.id,
    sessionId: optionalText(row.session_id),
    reason: row.reason,
    deletedKinds: jsonArray(row.deleted_kinds, 'deletedKinds'),
    completedAt: row.completed_at,
    contentFreeHash: row.content_free_hash,
  });
}

function normalizedCleanupReceipt(value: unknown): CleanupReceipt {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new StorageValidationError('record');
  }
  const record = value as Record<string, unknown>;
  const validated = validateCleanupReceipt({ ...record, createdAt: record.completedAt });
  return {
    id: validated.id,
    sessionId: validated.sessionId,
    reason: validated.reason,
    deletedKinds: validated.deletedKinds,
    completedAt: validated.completedAt,
    contentFreeHash: validated.contentFreeHash,
  };
}

function mapRecordingOperation(row: OperationRow): RecordingOperation {
  return validateRecordingOperation({
    id: row.id,
    sessionId: row.session_id,
    operationKind: row.operation_kind,
    status: row.status,
    createdAt: row.created_at,
    completedAt: optionalText(row.completed_at),
  });
}
