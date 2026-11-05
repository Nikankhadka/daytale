export const RECORDING_INTENT_VERSION = 1;
export const RECORDING_INTENT_KINDS = ['pause', 'resume', 'stop'] as const;
export const RECORDING_INTENT_SOURCES = ['ios-activity', 'android-notification'] as const;

export type RecordingIntentKind = (typeof RECORDING_INTENT_KINDS)[number];
export type RecordingIntentSource = (typeof RECORDING_INTENT_SOURCES)[number];

export type RecordingIntentRecord = {
  version: typeof RECORDING_INTENT_VERSION;
  id: string;
  kind: RecordingIntentKind;
  sessionId: string;
  createdAt: string;
  source: RecordingIntentSource;
};

// Matches the storage schema's UUID constraint: versions 1-5, RFC variant, case-insensitive.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isIsoUtcTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.endsWith('Z') && !Number.isNaN(Date.parse(value));
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/**
 * Validates a native intent record and copies only the six contract fields. Unknown keys such as
 * transcript or journal are dropped, and the input is never mutated.
 */
export function parseRecordingIntentRecord(value: unknown): RecordingIntentRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.version !== RECORDING_INTENT_VERSION) {
    return null;
  }
  if (!isUuid(record.id) || !isUuid(record.sessionId)) {
    return null;
  }
  if (!isOneOf(RECORDING_INTENT_KINDS, record.kind)) {
    return null;
  }
  if (!isOneOf(RECORDING_INTENT_SOURCES, record.source)) {
    return null;
  }
  if (!isIsoUtcTimestamp(record.createdAt)) {
    return null;
  }
  return {
    version: RECORDING_INTENT_VERSION,
    id: record.id,
    kind: record.kind,
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    source: record.source,
  };
}

export function isRecordingIntentRecord(value: unknown): value is RecordingIntentRecord {
  return parseRecordingIntentRecord(value) !== null;
}
