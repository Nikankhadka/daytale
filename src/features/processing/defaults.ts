import type { StorageBootstrapResult } from '../../storage/bootstrap';
import { createDefaultTranscriptionDeps, transcribeSession } from '../transcription';

/**
 * Wires the real local transcription pipeline. The whisper and speaker models are created lazily
 * and load on first use, so building this before a pipeline run is cheap.
 */
export function createDefaultTranscribe(storage: StorageBootstrapResult) {
  const dependencies = createDefaultTranscriptionDeps(storage);
  return (sessionId: string, options: { signal?: AbortSignal }) =>
    transcribeSession(dependencies, sessionId, options);
}
