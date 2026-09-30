import { randomUUID } from 'expo-crypto';

import type { StorageRepositories } from '../../storage/repositories';
import type { RecordingSession } from '../../storage/types';
import { closeChunk } from './chunk';
import { expoRecordingFiles, type RecordingFiles } from './files';
import { expoAudioNative, type RecordingNative } from './recorder';

export type RecoveryDependencies = {
  native?: Pick<RecordingNative, 'deleteFile'>;
  files?: RecordingFiles;
  uuid?: () => string;
};

/**
 * Settles sessions left `recording` or `paused` by a crash. Only active chunks are touched: a
 * readable capture file is closed (hash plus encrypted blob) and recorded as the session's
 * `lastRecoveredChunkId`; an unreadable one is discarded. A `recording` session always lands in
 * `paused` with failureCode `crash-recovered`, so capture never resumes without the user.
 */
export async function recoverOnLaunch(
  repositories: StorageRepositories,
  now: Date,
  dependencies: RecoveryDependencies = {},
): Promise<RecordingSession[]> {
  const native = dependencies.native ?? expoAudioNative;
  const files = dependencies.files ?? expoRecordingFiles;
  const uuid = dependencies.uuid ?? randomUUID;
  const chunkDependencies = { repositories, native, files };

  const sessions = (await repositories.recordingSessions.list()).filter(
    (session) => session.status === 'recording' || session.status === 'paused',
  );
  const chunks = await repositories.audioChunks.list();
  const recovered: RecordingSession[] = [];

  for (const session of sessions) {
    try {
      const at = new Date(Math.max(now.getTime(), Date.parse(session.updatedAt))).toISOString();
      const active = chunks
        .filter((chunk) => chunk.sessionId === session.id && chunk.state === 'active')
        .sort((a, b) => a.sequence - b.sequence);
      const sessionOperation =
        session.status === 'recording'
          ? {
              operation: {
                id: uuid(),
                sessionId: session.id,
                operationKind: 'recover_recording',
                status: 'pending' as const,
                createdAt: at,
              },
              action: { type: 'pause' as const, at, failureCode: 'crash-recovered' },
            }
          : undefined;

      // The session transition rides with the last chunk so both commit together.
      for (const [index, chunk] of active.entries()) {
        await closeChunk(chunkDependencies, chunk, at, {
          recovered: true,
          sessionOperation: index === active.length - 1 ? sessionOperation : undefined,
        });
      }
      if (active.length === 0 && sessionOperation !== undefined) {
        await repositories.applyRecordingSessionOperation(
          sessionOperation.operation,
          sessionOperation.action,
        );
      }
      const settled = await repositories.recordingSessions.getById(session.id);
      if (settled !== null) {
        recovered.push(settled);
      }
    } catch {
      // Leave this session as-is; the next launch retries it.
    }
  }
  return recovered;
}
