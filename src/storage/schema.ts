export const DATABASE_SCHEMA_VERSION = 3;

function uuidConstraint(column: string): string {
  return `length(${column}) = 36 AND length(replace(${column}, '-', '')) = 32 AND substr(${column}, 9, 1) = '-' AND substr(${column}, 14, 1) = '-' AND substr(${column}, 19, 1) = '-' AND substr(${column}, 24, 1) = '-' AND ${column} NOT GLOB '*[^0-9A-Fa-f-]*' AND substr(${column}, 15, 1) GLOB '[1-5]' AND substr(${column}, 20, 1) GLOB '[89abAB]'`;
}

const UUID_CONSTRAINT = uuidConstraint('id');

function utcConstraint(column: string): string {
  return [
    `length(${column}) = 24`,
    `${column} GLOB '????-??-??T??:??:??.???Z'`,
    `${column} NOT GLOB '*[^0-9TZ:.-]*'`,
    `strftime('%Y-%m-%dT%H:%M:%fZ', ${column}) IS NOT NULL`,
    `strftime('%Y-%m-%dT%H:%M:%fZ', ${column}) = ${column}`,
    `substr(${column}, 5, 1) = '-'`,
    `substr(${column}, 8, 1) = '-'`,
    `substr(${column}, 11, 1) = 'T'`,
    `substr(${column}, 14, 1) = ':'`,
    `substr(${column}, 17, 1) = ':'`,
    `substr(${column}, 20, 1) = '.'`,
    `substr(${column}, 24, 1) = 'Z'`,
    `CAST(substr(${column}, 6, 2) AS INTEGER) BETWEEN 1 AND 12`,
    `CAST(substr(${column}, 9, 2) AS INTEGER) BETWEEN 1 AND 31`,
    `CAST(substr(${column}, 12, 2) AS INTEGER) BETWEEN 0 AND 23`,
    `CAST(substr(${column}, 15, 2) AS INTEGER) BETWEEN 0 AND 59`,
    `CAST(substr(${column}, 18, 2) AS INTEGER) BETWEEN 0 AND 59`,
    `CAST(substr(${column}, 21, 3) AS INTEGER) BETWEEN 0 AND 999`,
  ].join(' AND ');
}

export const CREATE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS app_preferences (
    id TEXT PRIMARY KEY NOT NULL CHECK (${UUID_CONSTRAINT}),
    first_name TEXT,
    spoken_languages TEXT NOT NULL,
    journal_language TEXT NOT NULL CHECK (journal_language IN ('en', 'ne')),
    schedule_start_local TEXT NOT NULL,
    schedule_end_local TEXT NOT NULL,
    timezone TEXT NOT NULL,
    notifications_enabled INTEGER NOT NULL CHECK (notifications_enabled IN (0, 1)),
    microphone_permission_state TEXT NOT NULL CHECK (microphone_permission_state IN ('undetermined', 'granted', 'denied', 'blocked')),
    onboarding_complete INTEGER NOT NULL CHECK (onboarding_complete IN (0, 1)),
    theme TEXT NOT NULL CHECK (theme IN ('system', 'light', 'dark')),
    reduced_motion INTEGER NOT NULL CHECK (reduced_motion IN (0, 1)),
    created_at TEXT NOT NULL CHECK (${utcConstraint('created_at')}),
    updated_at TEXT NOT NULL CHECK (${utcConstraint('updated_at')})
  )`,
  `CREATE TABLE IF NOT EXISTS voice_profiles (
    id TEXT PRIMARY KEY NOT NULL CHECK (${UUID_CONSTRAINT}),
    status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'deleted')),
    sample_count INTEGER NOT NULL CHECK (sample_count BETWEEN 0 AND 3),
    encrypted_embedding_blob TEXT NOT NULL,
    model_version TEXT NOT NULL,
    created_at TEXT NOT NULL CHECK (${utcConstraint('created_at')}),
    updated_at TEXT NOT NULL CHECK (${utcConstraint('updated_at')}),
    deleted_at TEXT CHECK (deleted_at IS NULL OR ${utcConstraint('deleted_at')})
  )`,
  `CREATE TABLE IF NOT EXISTS recording_sessions (
    id TEXT PRIMARY KEY NOT NULL CHECK (${UUID_CONSTRAINT}),
    scheduled_start TEXT NOT NULL CHECK (${utcConstraint('scheduled_start')}),
    scheduled_end TEXT NOT NULL CHECK (${utcConstraint('scheduled_end')}),
    actual_start TEXT CHECK (actual_start IS NULL OR ${utcConstraint('actual_start')}),
    actual_end TEXT CHECK (actual_end IS NULL OR ${utcConstraint('actual_end')}),
    timezone TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'recording', 'paused', 'transcribing', 'analyzing', 'awaiting clarification', 'generating', 'ready', 'failed', 'expired', 'discarded')),
    pause_intervals TEXT NOT NULL,
    last_recovered_chunk_id TEXT REFERENCES audio_chunks(id) ON DELETE SET NULL,
    failure_code TEXT,
    retry_until TEXT CHECK (retry_until IS NULL OR ${utcConstraint('retry_until')}),
    created_at TEXT NOT NULL CHECK (${utcConstraint('created_at')}),
    updated_at TEXT NOT NULL CHECK (${utcConstraint('updated_at')})
  )`,
  `CREATE TABLE IF NOT EXISTS audio_chunks (
    id TEXT PRIMARY KEY NOT NULL CHECK (${UUID_CONSTRAINT}),
    session_id TEXT NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK (sequence >= 0),
    started_at TEXT NOT NULL CHECK (${utcConstraint('started_at')}),
    ended_at TEXT CHECK (ended_at IS NULL OR ${utcConstraint('ended_at')}),
    codec TEXT NOT NULL,
    sample_rate INTEGER NOT NULL CHECK (sample_rate > 0),
    encrypted_path TEXT NOT NULL,
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    state TEXT NOT NULL CHECK (state IN ('active', 'closed', 'transcribed', 'deleted')),
    delete_after TEXT NOT NULL CHECK (${utcConstraint('delete_after')}),
    created_at TEXT NOT NULL CHECK (${utcConstraint('created_at')}),
    UNIQUE (session_id, sequence)
  )`,
  `CREATE TABLE IF NOT EXISTS transcript_segments (
    id TEXT PRIMARY KEY NOT NULL CHECK (${UUID_CONSTRAINT}),
    session_id TEXT NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    chunk_id TEXT NOT NULL REFERENCES audio_chunks(id) ON DELETE CASCADE,
    start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
    end_ms INTEGER NOT NULL CHECK (end_ms >= start_ms),
    text TEXT NOT NULL,
    language TEXT NOT NULL CHECK (language IN ('en', 'ne')),
    speaker TEXT NOT NULL CHECK (speaker IN ('user', 'other', 'unknown')),
    speaker_confidence REAL NOT NULL CHECK (speaker_confidence BETWEEN 0 AND 1),
    transcript_confidence REAL NOT NULL CHECK (transcript_confidence BETWEEN 0 AND 1),
    created_at TEXT NOT NULL CHECK (${utcConstraint('created_at')})
  )`,
  `CREATE TABLE IF NOT EXISTS extracted_events (
    id TEXT PRIMARY KEY NOT NULL CHECK (${UUID_CONSTRAINT}),
    session_id TEXT NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
    end_ms INTEGER NOT NULL CHECK (end_ms >= start_ms),
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence_segment_ids TEXT NOT NULL,
    speaker TEXT NOT NULL CHECK (speaker IN ('user', 'other', 'unknown')),
    confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    supported INTEGER NOT NULL CHECK (supported IN (0, 1)),
    created_at TEXT NOT NULL CHECK (${utcConstraint('created_at')})
  )`,
  `CREATE TABLE IF NOT EXISTS clarification_questions (
    id TEXT PRIMARY KEY NOT NULL CHECK (${UUID_CONSTRAINT}),
    session_id TEXT NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
    end_ms INTEGER NOT NULL CHECK (end_ms >= start_ms),
    question TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'answered', 'skipped')),
    created_at TEXT NOT NULL CHECK (${utcConstraint('created_at')})
  )`,
  `CREATE TABLE IF NOT EXISTS clarification_answers (
    id TEXT PRIMARY KEY NOT NULL CHECK (${UUID_CONSTRAINT}),
    question_id TEXT NOT NULL REFERENCES clarification_questions(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL,
    created_at TEXT NOT NULL CHECK (${utcConstraint('created_at')})
  )`,
  `CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY NOT NULL CHECK (${UUID_CONSTRAINT}),
    session_id TEXT NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    timezone TEXT NOT NULL,
    title TEXT NOT NULL,
    paragraphs TEXT NOT NULL,
    context_tags TEXT NOT NULL,
    source_event_ids TEXT NOT NULL,
    language TEXT NOT NULL CHECK (language IN ('en', 'ne')),
    edited_at TEXT CHECK (edited_at IS NULL OR ${utcConstraint('edited_at')}),
    created_at TEXT NOT NULL CHECK (${utcConstraint('created_at')}),
    updated_at TEXT NOT NULL CHECK (${utcConstraint('updated_at')})
  )`,
  `CREATE TABLE IF NOT EXISTS cleanup_receipts (
    id TEXT PRIMARY KEY NOT NULL CHECK (${UUID_CONSTRAINT}),
    session_id TEXT REFERENCES recording_sessions(id) ON DELETE SET NULL,
    reason TEXT NOT NULL CHECK (reason IN ('success', 'expired', 'discarded', 'user_deleted')),
    deleted_kinds TEXT NOT NULL,
    completed_at TEXT NOT NULL CHECK (${utcConstraint('completed_at')}),
    content_free_hash TEXT NOT NULL CHECK (length(content_free_hash) = 64)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_audio_chunks_delete_after ON audio_chunks(delete_after)',
  'CREATE INDEX IF NOT EXISTS idx_recording_sessions_retry_until ON recording_sessions(retry_until)',
  'CREATE INDEX IF NOT EXISTS idx_cleanup_receipts_session_id ON cleanup_receipts(session_id)',
] as const;

export const CREATE_OPERATION_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS recording_operations (
    id TEXT PRIMARY KEY NOT NULL CHECK (${UUID_CONSTRAINT}),
    session_id TEXT NOT NULL CHECK (${uuidConstraint('session_id')}) REFERENCES recording_sessions(id) ON DELETE CASCADE,
    operation_kind TEXT NOT NULL CHECK (length(operation_kind) BETWEEN 1 AND 64 AND substr(operation_kind, 1, 1) GLOB '[a-z]' AND operation_kind NOT GLOB '*[^a-z0-9_]*'),
    status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'rejected')),
    created_at TEXT NOT NULL CHECK (${utcConstraint('created_at')}),
    completed_at TEXT CHECK (completed_at IS NULL OR ${utcConstraint('completed_at')})
  )`,
  'CREATE INDEX IF NOT EXISTS idx_recording_operations_session_id ON recording_operations(session_id)',
] as const;

export const CREATE_RETRY_TARGET_SCHEMA_STATEMENTS = [
  `ALTER TABLE recording_sessions ADD COLUMN retry_target TEXT CHECK (retry_target IS NULL OR retry_target IN ('recording', 'transcribing', 'analyzing', 'awaiting clarification', 'generating'))`,
] as const;

export const SCHEMA_SQL = `${[
  ...CREATE_SCHEMA_STATEMENTS,
  ...CREATE_OPERATION_SCHEMA_STATEMENTS,
  ...CREATE_RETRY_TARGET_SCHEMA_STATEMENTS,
].join(';\n')};`;
