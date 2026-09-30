import type { TestDatabase } from '../recording/testKit';
import {
  bytesOf,
  createMigratedDatabase,
  makeScheduledSession,
  sha256Hex,
  SESSION_ID,
} from '../recording/testKit';
import {
  createStorageRepositories,
  type StorageRepositories,
} from '../../src/storage/repositories';
import type { AudioChunk, TranscriptSegment } from '../../src/storage/types';

export { SESSION_ID };

export const CHUNK_STARTED_AT = '2026-03-10T09:00:00.000Z';

export function chunkId(sequence: number): string {
  return `cccccccc-cccc-4ccc-8ccc-${String(sequence).padStart(12, '0')}`;
}

export function audioFor(sequence: number): Uint8Array {
  return bytesOf(`m4a-bytes-${sequence}`);
}

export function makeClosedChunk(sequence: number, audio = audioFor(sequence)): AudioChunk {
  return {
    id: chunkId(sequence),
    sessionId: SESSION_ID,
    sequence,
    startedAt: new Date(Date.parse(CHUNK_STARTED_AT) + sequence * 30_000).toISOString(),
    endedAt: new Date(Date.parse(CHUNK_STARTED_AT) + (sequence + 1) * 30_000).toISOString(),
    codec: 'aac',
    sampleRate: 16_000,
    encryptedPath: `file:///cache/chunk-${sequence}.m4a`,
    sha256: sha256Hex(audio),
    state: 'closed',
    deleteAfter: '2026-03-11T09:00:00.000Z',
    createdAt: CHUNK_STARTED_AT,
  };
}

export function segmentUuid(index: number): string {
  return `eeeeeeee-eeee-4eee-8eee-${String(index).padStart(12, '0')}`;
}

export function makeSegment(
  sequence: number,
  index: number,
  overrides: Partial<TranscriptSegment> = {},
): TranscriptSegment {
  return {
    id: segmentUuid(sequence * 100 + index),
    sessionId: SESSION_ID,
    chunkId: chunkId(sequence),
    startMs: index * 1000,
    endMs: index * 1000 + 900,
    text: `segment ${index}`,
    language: 'en',
    speaker: 'unknown',
    speakerConfidence: 0,
    transcriptConfidence: 0.9,
    createdAt: '2026-03-10T09:10:00.000Z',
    ...overrides,
  };
}

export type StorageFixture = {
  database: TestDatabase;
  repositories: StorageRepositories;
};

/** A migrated in-memory database holding one transcribing session and `chunks` closed chunks. */
export async function createStorageFixture(chunks = 1): Promise<StorageFixture> {
  const database = await createMigratedDatabase();
  const repositories = createStorageRepositories(database);
  await repositories.recordingSessions.save(makeScheduledSession({ status: 'transcribing' }));
  for (let sequence = 0; sequence < chunks; sequence += 1) {
    await repositories.saveClosedAudioChunk({
      chunk: makeClosedChunk(sequence),
      audio: audioFor(sequence),
    });
  }
  return { database, repositories };
}

export async function chunkAudio(
  database: TestDatabase,
  sequence: number,
): Promise<Uint8Array | null> {
  const row = database.native
    .prepare('SELECT audio FROM audio_chunks WHERE id = ?')
    .get(chunkId(sequence)) as { audio: Uint8Array | null };
  return row.audio;
}

export function chunkState(database: TestDatabase, sequence: number): string {
  const row = database.native
    .prepare('SELECT state FROM audio_chunks WHERE id = ?')
    .get(chunkId(sequence)) as { state: string };
  return row.state;
}

export function countRows(database: TestDatabase, table: string): number {
  const row = database.native.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
    n: number;
  };
  return row.n;
}
