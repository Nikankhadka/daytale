import { randomUUID } from 'expo-crypto';

import { useSessionStore } from '../../state/session';
import type { CleanupDependencies } from '../../storage/cleanup';
import type { StorageBootstrapResult } from '../../storage/bootstrap';
import type { RecordingSession } from '../../storage/types';
import { cleanupExpiredSession } from './expiry';

type Clock = {
  now?: () => Date;
  uuid?: () => string;
  /** Device edges of the cleanup (file delete, hashing, ids); tests replace them. */
  cleanup?: Omit<CleanupDependencies, 'now' | 'reason'>;
};

export type RetryOutcome = 'retried' | 'expired' | 'rejected';

const publish = (session: RecordingSession | null) => {
  if (session !== null) {
    useSessionStore.getState().setRecordingSession(session);
  }
};

// The reducer refuses timestamps that move backwards, so never act earlier than the last update.
const stampFor = (session: RecordingSession, now: Date): string =>
  new Date(Math.max(now.getTime(), Date.parse(session.updatedAt))).toISOString();

/** "Skip today": a session that has not started is set aside, and the operation is recorded. */
export async function skipSession(
  storage: StorageBootstrapResult,
  sessionId: string,
  { now = () => new Date(), uuid = randomUUID }: Clock = {},
): Promise<boolean> {
  const session = await storage.repositories.recordingSessions.getById(sessionId);
  if (session === null) {
    return false;
  }
  const at = stampFor(session, now());
  const result = await storage.repositories.applyRecordingSessionOperation(
    {
      id: uuid(),
      sessionId,
      operationKind: 'skip_recording',
      status: 'pending',
      createdAt: at,
    },
    { type: 'discard', at },
  );
  publish(result.session);
  return result.operation.status === 'applied';
}

/**
 * "Try again" on a failed session. The caller owns `operationId` and reuses it for a repeated tap,
 * so the same press can never apply twice. A retry that arrives after the deadline is refused by
 * the reducer; the session is then expired and its retry material deleted.
 */
export async function retrySession(
  storage: StorageBootstrapResult,
  sessionId: string,
  operationId: string,
  { now = () => new Date(), cleanup }: Clock = {},
): Promise<RetryOutcome> {
  const session = await storage.repositories.recordingSessions.getById(sessionId);
  if (session === null) {
    return 'rejected';
  }
  const at = stampFor(session, now());
  const result = await storage.repositories.applyRecordingSessionOperation(
    {
      id: operationId,
      sessionId,
      operationKind: 'retry_recording',
      status: 'pending',
      createdAt: at,
    },
    { type: 'retry', at },
  );
  publish(result.session);
  if (result.operation.status === 'applied') {
    return 'retried';
  }
  const expired =
    result.session.retryUntil !== undefined &&
    Date.parse(at) > Date.parse(result.session.retryUntil);
  if (expired) {
    await cleanupExpiredSession(storage.database, sessionId, { ...cleanup, now: () => at });
    publish(await storage.repositories.recordingSessions.getById(sessionId));
    return 'expired';
  }
  return 'rejected';
}

/** "Discard this session": the user gives up on a failed session, so its retry material goes now. */
export async function discardFailedSession(
  storage: StorageBootstrapResult,
  sessionId: string,
  { now = () => new Date(), cleanup }: Clock = {},
): Promise<boolean> {
  const receipt = await cleanupExpiredSession(storage.database, sessionId, {
    ...cleanup,
    reason: 'discarded',
    now: () => now().toISOString(),
  });
  publish(await storage.repositories.recordingSessions.getById(sessionId));
  return receipt !== null;
}
