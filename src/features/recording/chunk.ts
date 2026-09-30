import type {
  ClosedAudioChunkWrite,
  RecordingSessionOperationResult,
  StorageRepositories,
} from '../../storage/repositories';
import { MAX_RETRY_WINDOW_MS, type AudioChunk } from '../../storage/types';
import type { RecordingFiles } from './files';
import { RECORDING_CODEC, RECORDING_SAMPLE_RATE, type RecordingNative } from './recorder';

export type ChunkDependencies = {
  repositories: StorageRepositories;
  native: Pick<RecordingNative, 'deleteFile'>;
  files: RecordingFiles;
};

/** Stands in for the hash until the chunk closes; the audio_chunks schema requires 64 hex characters. */
const PENDING_SHA256 = '0'.repeat(64);

function retentionDeadline(from: string): string {
  return new Date(Date.parse(from) + MAX_RETRY_WINDOW_MS).toISOString();
}

export function newActiveChunk(input: {
  id: string;
  sessionId: string;
  sequence: number;
  uri: string;
  startedAt: string;
}): AudioChunk {
  return {
    id: input.id,
    sessionId: input.sessionId,
    sequence: input.sequence,
    startedAt: input.startedAt,
    codec: RECORDING_CODEC,
    sampleRate: RECORDING_SAMPLE_RATE,
    // The recorder picks its own cache file, so the active row records where the capture lives.
    encryptedPath: input.uri,
    sha256: PENDING_SHA256,
    state: 'active',
    deleteAfter: retentionDeadline(input.startedAt),
    createdAt: input.startedAt,
  };
}

/**
 * Closes a stopped capture: hashes the file, commits the bytes into the encrypted database
 * (together with any session transition) and only then deletes the plaintext file. A chunk whose
 * file is missing or empty cannot be proven intact and is discarded. A failed commit throws and
 * leaves the file and the active row in place so the chunk can be retried or recovered.
 */
export async function closeChunk(
  dependencies: ChunkDependencies,
  chunk: AudioChunk,
  endedAt: string,
  options: Pick<ClosedAudioChunkWrite, 'sessionOperation' | 'recovered'> = {},
): Promise<{ outcome: 'closed' | 'discarded'; result: RecordingSessionOperationResult | null }> {
  const { repositories, files } = dependencies;
  const audio = await files.readBytes(chunk.encryptedPath).catch(() => null);
  if (audio === null || audio.byteLength === 0) {
    await repositories.audioChunks.save({ ...chunk, endedAt, state: 'deleted' });
    await removeFile(dependencies, chunk);
    const { sessionOperation } = options;
    const result =
      sessionOperation === undefined
        ? null
        : await repositories.applyRecordingSessionOperation(
            sessionOperation.operation,
            sessionOperation.action,
          );
    return { outcome: 'discarded', result };
  }

  const closed: AudioChunk = {
    ...chunk,
    endedAt,
    sha256: await files.sha256(audio),
    state: 'closed',
    deleteAfter: retentionDeadline(endedAt),
  };
  const result = await repositories.saveClosedAudioChunk({ chunk: closed, audio, ...options });
  await removeFile(dependencies, chunk);
  return { outcome: 'closed', result };
}

// A failed plaintext delete is tolerated because the row keeps the path, so expiry cleanup and
// delete-all retry the deletion.
async function removeFile(dependencies: ChunkDependencies, chunk: AudioChunk): Promise<void> {
  await dependencies.native.deleteFile(chunk.encryptedPath).catch(() => undefined);
}
