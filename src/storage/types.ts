export type UtcTimestamp = string;
export type Language = 'en' | 'ne';
export type Theme = 'system' | 'light' | 'dark';
export type MicrophonePermissionState = 'undetermined' | 'granted' | 'denied' | 'blocked';

export const RECORDING_SESSION_STATUSES = [
  'scheduled',
  'recording',
  'paused',
  'transcribing',
  'analyzing',
  'awaiting clarification',
  'generating',
  'ready',
  'failed',
  'expired',
  'discarded',
] as const;

export type RecordingSessionStatus = (typeof RECORDING_SESSION_STATUSES)[number];

export const RECORDING_SESSION_RETRY_TARGETS = [
  'recording',
  'transcribing',
  'analyzing',
  'awaiting clarification',
  'generating',
] as const;

export type RecordingSessionRetryTarget = (typeof RECORDING_SESSION_RETRY_TARGETS)[number];
export const MAX_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const RECORDING_OPERATION_STATUSES = ['pending', 'applied', 'rejected'] as const;
export type RecordingOperationStatus = (typeof RECORDING_OPERATION_STATUSES)[number];

export type VoiceProfileStatus = 'pending' | 'ready' | 'deleted';
export type AudioChunkState = 'active' | 'closed' | 'transcribed' | 'deleted';
export type TranscriptSpeaker = 'user' | 'other' | 'unknown';
export type ClarificationQuestionStatus = 'open' | 'answered' | 'skipped';
export type CleanupReason = 'success' | 'expired' | 'discarded' | 'user_deleted';

export type PauseInterval = {
  startedAt: UtcTimestamp;
  endedAt?: UtcTimestamp;
};

export type AppPreferences = {
  id: string;
  firstName?: string;
  spokenLanguages: Language[];
  journalLanguage: Language;
  scheduleStartLocal: string;
  scheduleEndLocal: string;
  timezone: string;
  notificationsEnabled: boolean;
  microphonePermissionState: MicrophonePermissionState;
  onboardingComplete: boolean;
  theme: Theme;
  reducedMotion: boolean;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
};

export type VoiceProfile = {
  id: string;
  status: VoiceProfileStatus;
  sampleCount: number;
  encryptedEmbeddingBlob: string;
  modelVersion: string;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
  deletedAt?: UtcTimestamp;
};

export type RecordingSession = {
  id: string;
  scheduledStart: UtcTimestamp;
  scheduledEnd: UtcTimestamp;
  actualStart?: UtcTimestamp;
  actualEnd?: UtcTimestamp;
  timezone: string;
  status: RecordingSessionStatus;
  pauseIntervals: PauseInterval[];
  lastRecoveredChunkId?: string;
  failureCode?: string;
  retryUntil?: UtcTimestamp;
  retryTarget?: RecordingSessionRetryTarget;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
};

/**
 * Content-free durable identity for a session command. The operation id is
 * reused by callers when a command is retried after process recreation.
 */
export type RecordingOperation = {
  id: string;
  sessionId: string;
  operationKind: string;
  status: RecordingOperationStatus;
  createdAt: UtcTimestamp;
  completedAt?: UtcTimestamp;
};

export type AudioChunk = {
  id: string;
  sessionId: string;
  sequence: number;
  startedAt: UtcTimestamp;
  endedAt?: UtcTimestamp;
  codec: string;
  sampleRate: number;
  encryptedPath: string;
  sha256: string;
  state: AudioChunkState;
  deleteAfter: UtcTimestamp;
  createdAt: UtcTimestamp;
};

export type TranscriptSegment = {
  id: string;
  sessionId: string;
  chunkId: string;
  startMs: number;
  endMs: number;
  text: string;
  language: Language;
  speaker: TranscriptSpeaker;
  speakerConfidence: number;
  transcriptConfidence: number;
  createdAt: UtcTimestamp;
};

export type ExtractedEvent = {
  id: string;
  sessionId: string;
  startMs: number;
  endMs: number;
  kind: string;
  summary: string;
  evidenceSegmentIds: string[];
  speaker: TranscriptSpeaker;
  confidence: number;
  supported: boolean;
  createdAt: UtcTimestamp;
};

export type ClarificationQuestion = {
  id: string;
  sessionId: string;
  startMs: number;
  endMs: number;
  question: string;
  reason: string;
  status: ClarificationQuestionStatus;
  createdAt: UtcTimestamp;
};

export type ClarificationAnswer = {
  id: string;
  questionId: string;
  answerText: string;
  createdAt: UtcTimestamp;
};

export type JournalEntry = {
  id: string;
  sessionId: string;
  date: string;
  timezone: string;
  title: string;
  paragraphs: string[];
  contextTags: string[];
  sourceEventIds: string[];
  language: Language;
  editedAt?: UtcTimestamp;
  createdAt: UtcTimestamp;
  updatedAt: UtcTimestamp;
};

export const CLEANUP_RECORD_KINDS = [
  'audio_chunks',
  'transcript_segments',
  'extracted_events',
  'clarification_questions',
  'clarification_answers',
] as const;

export type CleanupRecordKind = (typeof CLEANUP_RECORD_KINDS)[number];

export type CleanupReceipt = {
  id: string;
  sessionId?: string;
  reason: CleanupReason;
  deletedKinds: CleanupRecordKind[];
  completedAt: UtcTimestamp;
  contentFreeHash: string;
};

export class StorageValidationError extends Error {
  public constructor(field: string) {
    super(`Invalid storage record field: ${field}`);
    this.name = 'StorageValidationError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const OPERATION_KIND_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const LOCAL_TIME_PATTERN = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateStorageId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new StorageValidationError('id');
  }
  return value;
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new StorageValidationError('record');
  }
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new StorageValidationError(field);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new StorageValidationError(field);
  }
  return value;
}

function uuid(record: Record<string, unknown>, field: string): string {
  const value = requiredString(record, field);
  if (!UUID_PATTERN.test(value)) {
    throw new StorageValidationError(field);
  }
  return value;
}

function timestamp(record: Record<string, unknown>, field: string): UtcTimestamp {
  const value = requiredString(record, field);
  if (!value.endsWith('Z') || Number.isNaN(Date.parse(value))) {
    throw new StorageValidationError(field);
  }
  return value;
}

function optionalTimestamp(
  record: Record<string, unknown>,
  field: string,
): UtcTimestamp | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  return timestamp(record, field);
}

function booleanValue(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  if (typeof value !== 'boolean') {
    throw new StorageValidationError(field);
  }
  return value;
}

function numberValue(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new StorageValidationError(field);
  }
  return value;
}

function enumValue<T extends string>(
  record: Record<string, unknown>,
  field: string,
  values: readonly T[],
): T {
  const value = requiredString(record, field);
  if (!values.includes(value as T)) {
    throw new StorageValidationError(field);
  }
  return value as T;
}

function stringArray(record: Record<string, unknown>, field: string): string[] {
  const value = record[field];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new StorageValidationError(field);
  }
  return value as string[];
}

function languageArray(record: Record<string, unknown>, field: string): Language[] {
  const values = stringArray(record, field);
  if (
    values.length === 0 ||
    new Set(values).size !== values.length ||
    values.some((value) => value !== 'en' && value !== 'ne')
  ) {
    throw new StorageValidationError(field);
  }
  return values as Language[];
}

function confidence(record: Record<string, unknown>, field: string): number {
  const value = numberValue(record, field);
  if (value < 0 || value > 1) {
    throw new StorageValidationError(field);
  }
  return value;
}

function milliseconds(record: Record<string, unknown>, field: string): number {
  const value = numberValue(record, field);
  if (value < 0) {
    throw new StorageValidationError(field);
  }
  return value;
}

function baseRecord(record: Record<string, unknown>): { id: string; createdAt: UtcTimestamp } {
  return { id: uuid(record, 'id'), createdAt: timestamp(record, 'createdAt') };
}

export function validateAppPreferences(value: unknown): AppPreferences {
  const record = objectRecord(value);
  const base = baseRecord(record);
  return {
    ...base,
    firstName: optionalString(record, 'firstName'),
    spokenLanguages: languageArray(record, 'spokenLanguages'),
    journalLanguage: enumValue(record, 'journalLanguage', ['en', 'ne']),
    scheduleStartLocal: timeString(record, 'scheduleStartLocal'),
    scheduleEndLocal: timeString(record, 'scheduleEndLocal'),
    timezone: requiredString(record, 'timezone'),
    notificationsEnabled: booleanValue(record, 'notificationsEnabled'),
    microphonePermissionState: enumValue(record, 'microphonePermissionState', [
      'undetermined',
      'granted',
      'denied',
      'blocked',
    ]),
    onboardingComplete: booleanValue(record, 'onboardingComplete'),
    theme: enumValue(record, 'theme', ['system', 'light', 'dark']),
    reducedMotion: booleanValue(record, 'reducedMotion'),
    updatedAt: timestamp(record, 'updatedAt'),
  };
}

export function validateVoiceProfile(value: unknown): VoiceProfile {
  const record = objectRecord(value);
  const base = baseRecord(record);
  const sampleCount = numberValue(record, 'sampleCount');
  if (!Number.isInteger(sampleCount) || sampleCount < 0 || sampleCount > 3) {
    throw new StorageValidationError('sampleCount');
  }
  return {
    ...base,
    status: enumValue(record, 'status', ['pending', 'ready', 'deleted']),
    sampleCount,
    encryptedEmbeddingBlob: requiredString(record, 'encryptedEmbeddingBlob'),
    modelVersion: requiredString(record, 'modelVersion'),
    updatedAt: timestamp(record, 'updatedAt'),
    deletedAt: optionalTimestamp(record, 'deletedAt'),
  };
}

export function validateRecordingSession(value: unknown): RecordingSession {
  const record = objectRecord(value);
  const base = baseRecord(record);
  const updatedAt = timestamp(record, 'updatedAt');
  const status = enumValue(record, 'status', RECORDING_SESSION_STATUSES);
  const retryUntil = optionalTimestamp(record, 'retryUntil');
  const retryTarget = optionalEnumValue(record, 'retryTarget', RECORDING_SESSION_RETRY_TARGETS);
  const hasRetryTarget = retryTarget !== undefined;
  const hasRetryUntil = retryUntil !== undefined;
  if (hasRetryTarget !== hasRetryUntil) {
    throw new StorageValidationError('retryTarget');
  }
  if (hasRetryTarget && status !== 'failed') {
    throw new StorageValidationError('retryTarget');
  }
  if (
    retryUntil !== undefined &&
    (Date.parse(retryUntil) < Date.parse(updatedAt) ||
      Date.parse(retryUntil) - Date.parse(updatedAt) > MAX_RETRY_WINDOW_MS)
  ) {
    throw new StorageValidationError('retryUntil');
  }
  const pauseIntervals = record.pauseIntervals;
  if (
    !Array.isArray(pauseIntervals) ||
    pauseIntervals.some((interval) => {
      try {
        const item = objectRecord(interval);
        timestamp(item, 'startedAt');
        optionalTimestamp(item, 'endedAt');
        return false;
      } catch {
        return true;
      }
    })
  ) {
    throw new StorageValidationError('pauseIntervals');
  }
  return {
    ...base,
    scheduledStart: timestamp(record, 'scheduledStart'),
    scheduledEnd: timestamp(record, 'scheduledEnd'),
    actualStart: optionalTimestamp(record, 'actualStart'),
    actualEnd: optionalTimestamp(record, 'actualEnd'),
    timezone: requiredString(record, 'timezone'),
    status,
    pauseIntervals: pauseIntervals as PauseInterval[],
    lastRecoveredChunkId: optionalUuid(record, 'lastRecoveredChunkId'),
    failureCode: optionalString(record, 'failureCode'),
    retryUntil,
    retryTarget,
    updatedAt,
  };
}

export function validateRecordingOperation(value: unknown): RecordingOperation {
  const record = objectRecord(value);
  const operationKind = requiredString(record, 'operationKind');
  if (!OPERATION_KIND_PATTERN.test(operationKind)) {
    throw new StorageValidationError('operationKind');
  }
  return {
    ...baseRecord(record),
    sessionId: uuid(record, 'sessionId'),
    operationKind,
    status: enumValue(record, 'status', RECORDING_OPERATION_STATUSES),
    completedAt: optionalTimestamp(record, 'completedAt'),
  };
}

export function validateAudioChunk(value: unknown): AudioChunk {
  const record = objectRecord(value);
  const base = baseRecord(record);
  const sampleRate = numberValue(record, 'sampleRate');
  const sequence = numberValue(record, 'sequence');
  const sha256 = requiredString(record, 'sha256');
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new StorageValidationError('sequence');
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new StorageValidationError('sampleRate');
  }
  if (!SHA256_PATTERN.test(sha256)) {
    throw new StorageValidationError('sha256');
  }
  return {
    ...base,
    sessionId: uuid(record, 'sessionId'),
    sequence,
    startedAt: timestamp(record, 'startedAt'),
    endedAt: optionalTimestamp(record, 'endedAt'),
    codec: requiredString(record, 'codec'),
    sampleRate,
    encryptedPath: requiredString(record, 'encryptedPath'),
    sha256,
    state: enumValue(record, 'state', ['active', 'closed', 'transcribed', 'deleted']),
    deleteAfter: timestamp(record, 'deleteAfter'),
  };
}

export function validateTranscriptSegment(value: unknown): TranscriptSegment {
  const record = objectRecord(value);
  const base = baseRecord(record);
  const startMs = milliseconds(record, 'startMs');
  const endMs = milliseconds(record, 'endMs');
  if (endMs < startMs) {
    throw new StorageValidationError('endMs');
  }
  return {
    ...base,
    sessionId: uuid(record, 'sessionId'),
    chunkId: uuid(record, 'chunkId'),
    startMs,
    endMs,
    text: requiredString(record, 'text'),
    language: enumValue(record, 'language', ['en', 'ne']),
    speaker: enumValue(record, 'speaker', ['user', 'other', 'unknown']),
    speakerConfidence: confidence(record, 'speakerConfidence'),
    transcriptConfidence: confidence(record, 'transcriptConfidence'),
  };
}

export function validateExtractedEvent(value: unknown): ExtractedEvent {
  const record = objectRecord(value);
  const base = baseRecord(record);
  const startMs = milliseconds(record, 'startMs');
  const endMs = milliseconds(record, 'endMs');
  if (endMs < startMs) {
    throw new StorageValidationError('endMs');
  }
  return {
    ...base,
    sessionId: uuid(record, 'sessionId'),
    startMs,
    endMs,
    kind: requiredString(record, 'kind'),
    summary: requiredString(record, 'summary'),
    evidenceSegmentIds: uuidArray(record, 'evidenceSegmentIds'),
    speaker: enumValue(record, 'speaker', ['user', 'other', 'unknown']),
    confidence: confidence(record, 'confidence'),
    supported: booleanValue(record, 'supported'),
  };
}

export function validateClarificationQuestion(value: unknown): ClarificationQuestion {
  const record = objectRecord(value);
  const base = baseRecord(record);
  const startMs = milliseconds(record, 'startMs');
  const endMs = milliseconds(record, 'endMs');
  if (endMs < startMs) {
    throw new StorageValidationError('endMs');
  }
  return {
    ...base,
    sessionId: uuid(record, 'sessionId'),
    startMs,
    endMs,
    question: requiredString(record, 'question'),
    reason: requiredString(record, 'reason'),
    status: enumValue(record, 'status', ['open', 'answered', 'skipped']),
  };
}

export function validateClarificationAnswer(value: unknown): ClarificationAnswer {
  const record = objectRecord(value);
  return {
    ...baseRecord(record),
    questionId: uuid(record, 'questionId'),
    answerText: requiredString(record, 'answerText'),
  };
}

export function validateJournalEntry(value: unknown): JournalEntry {
  const record = objectRecord(value);
  return {
    ...baseRecord(record),
    sessionId: uuid(record, 'sessionId'),
    date: dateString(record, 'date'),
    timezone: requiredString(record, 'timezone'),
    title: requiredString(record, 'title'),
    paragraphs: stringArray(record, 'paragraphs'),
    contextTags: stringArray(record, 'contextTags'),
    sourceEventIds: uuidArray(record, 'sourceEventIds'),
    language: enumValue(record, 'language', ['en', 'ne']),
    editedAt: optionalTimestamp(record, 'editedAt'),
    updatedAt: timestamp(record, 'updatedAt'),
  };
}

export function validateCleanupReceipt(value: unknown): CleanupReceipt {
  const record = objectRecord(value);
  const deletedKinds = stringArray(record, 'deletedKinds');
  if (deletedKinds.some((kind) => !CLEANUP_RECORD_KINDS.includes(kind as CleanupRecordKind))) {
    throw new StorageValidationError('deletedKinds');
  }
  const contentFreeHash = requiredString(record, 'contentFreeHash');
  if (!SHA256_PATTERN.test(contentFreeHash)) {
    throw new StorageValidationError('contentFreeHash');
  }
  return {
    ...baseRecord(record),
    sessionId: optionalUuid(record, 'sessionId'),
    reason: enumValue(record, 'reason', ['success', 'expired', 'discarded', 'user_deleted']),
    deletedKinds: deletedKinds as CleanupRecordKind[],
    completedAt: timestamp(record, 'completedAt'),
    contentFreeHash,
  };
}

function optionalUuid(record: Record<string, unknown>, field: string): string | undefined {
  if (record[field] === undefined) {
    return undefined;
  }
  return uuid(record, field);
}

function optionalEnumValue<T extends string>(
  record: Record<string, unknown>,
  field: string,
  values: readonly T[],
): T | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new StorageValidationError(field);
  }
  return value as T;
}

function uuidArray(record: Record<string, unknown>, field: string): string[] {
  const values = stringArray(record, field);
  if (values.some((value) => !UUID_PATTERN.test(value))) {
    throw new StorageValidationError(field);
  }
  return values;
}

function timeString(record: Record<string, unknown>, field: string): string {
  const value = requiredString(record, field);
  if (!LOCAL_TIME_PATTERN.test(value)) {
    throw new StorageValidationError(field);
  }
  return value;
}

function dateString(record: Record<string, unknown>, field: string): string {
  const value = requiredString(record, field);
  if (!LOCAL_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new StorageValidationError(field);
  }
  return value;
}
