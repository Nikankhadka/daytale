import {
  type PauseInterval,
  type RecordingSession,
  type RecordingSessionRetryTarget,
  type RecordingSessionStatus,
  type UtcTimestamp,
  MAX_RETRY_WINDOW_MS,
  validateRecordingSession,
} from '../storage/types';

export { MAX_RETRY_WINDOW_MS } from '../storage/types';

export const RECORDING_SESSION_TRANSITIONS: Readonly<
  Record<RecordingSessionStatus, readonly RecordingSessionStatus[]>
> = {
  scheduled: ['recording', 'failed', 'expired', 'discarded'],
  recording: ['paused', 'transcribing', 'failed', 'discarded'],
  paused: ['recording', 'transcribing', 'failed', 'discarded'],
  transcribing: ['analyzing', 'failed', 'expired'],
  analyzing: ['awaiting clarification', 'generating', 'failed', 'expired'],
  'awaiting clarification': ['generating', 'failed', 'expired'],
  generating: ['ready', 'failed', 'expired'],
  ready: [],
  failed: [
    'recording',
    'transcribing',
    'analyzing',
    'awaiting clarification',
    'generating',
    'expired',
  ],
  expired: [],
  discarded: [],
};

export type RecordingSessionAdvanceTarget =
  'analyzing' | 'awaiting clarification' | 'generating' | 'ready';

export type RecordingSessionAction =
  | { type: 'start'; at: UtcTimestamp }
  | { type: 'pause'; at: UtcTimestamp }
  | { type: 'resume'; at: UtcTimestamp }
  | { type: 'stop'; at: UtcTimestamp }
  | { type: 'scheduled-end' | 'scheduled_end' | 'scheduledEnd'; at: UtcTimestamp }
  | { type: 'advance'; to: RecordingSessionAdvanceTarget; at: UtcTimestamp }
  | {
      type: 'fail';
      at: UtcTimestamp;
      failureCode: string;
      retryUntil?: UtcTimestamp;
      retryTarget?: RecordingSessionRetryTarget;
    }
  | { type: 'retry'; at: UtcTimestamp }
  | { type: 'expire'; at: UtcTimestamp }
  | { type: 'discard'; at: UtcTimestamp };

const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function recordingSessionReducer(
  session: RecordingSession,
  action: RecordingSessionAction,
): RecordingSession | null {
  const current = validSession(session);
  if (current === null || !isValidUtcTimestamp(action.at)) {
    return null;
  }
  if (Date.parse(action.at) < Date.parse(current.updatedAt)) {
    return null;
  }
  if (
    current.actualStart !== undefined &&
    Date.parse(action.at) < Date.parse(current.actualStart)
  ) {
    return null;
  }
  if (
    'retryUntil' in action &&
    action.retryUntil !== undefined &&
    (!isValidUtcTimestamp(action.retryUntil) ||
      Date.parse(action.retryUntil) < Date.parse(action.at))
  ) {
    return null;
  }

  switch (action.type) {
    case 'start':
      return transition(current, 'recording', action.at, {
        actualStart: action.at,
      });
    case 'pause':
      if (current.status !== 'recording' || current.actualStart === undefined) {
        return null;
      }
      if (hasOpenPauseInterval(current.pauseIntervals)) {
        return null;
      }
      return transition(current, 'paused', action.at, {
        pauseIntervals: [...current.pauseIntervals, { startedAt: action.at }],
      });
    case 'resume': {
      if (current.status !== 'paused' || current.actualStart === undefined) {
        return null;
      }
      const pauseIntervals = closeOpenPauseInterval(current.pauseIntervals, action.at);
      if (pauseIntervals === null) {
        return null;
      }
      return transition(current, 'recording', action.at, {
        pauseIntervals,
      });
    }
    case 'stop':
    case 'scheduled-end':
    case 'scheduled_end':
    case 'scheduledEnd': {
      if (current.status !== 'recording' && current.status !== 'paused') {
        return null;
      }
      if (current.actualStart === undefined) {
        return null;
      }
      const pauseIntervals =
        current.status === 'paused'
          ? closeOpenPauseInterval(current.pauseIntervals, action.at)
          : current.pauseIntervals;
      if (pauseIntervals === null) {
        return null;
      }
      return transition(current, 'transcribing', action.at, {
        actualEnd: action.at,
        pauseIntervals,
      });
    }
    case 'advance':
      return transition(current, action.to, action.at);
    case 'fail': {
      if (!isNonEmptyString(action.failureCode)) {
        return null;
      }
      const hasRetryTarget = action.retryTarget !== undefined;
      const hasRetryUntil = action.retryUntil !== undefined;
      if (hasRetryTarget !== hasRetryUntil) {
        return null;
      }
      if (
        action.retryUntil !== undefined &&
        Date.parse(action.retryUntil) - Date.parse(action.at) > MAX_RETRY_WINDOW_MS
      ) {
        return null;
      }
      const pauseIntervals =
        current.status === 'paused'
          ? closeOpenPauseInterval(current.pauseIntervals, action.at)
          : current.pauseIntervals;
      if (pauseIntervals === null) {
        return null;
      }
      return transition(current, 'failed', action.at, {
        failureCode: action.failureCode,
        retryUntil: action.retryUntil,
        retryTarget: action.retryTarget,
        actualEnd:
          current.status === 'recording' || current.status === 'paused'
            ? action.at
            : current.actualEnd,
        pauseIntervals,
      });
    }
    case 'retry':
      if (current.status !== 'failed' || current.retryTarget === undefined) {
        return null;
      }
      if (
        current.retryUntil !== undefined &&
        Date.parse(action.at) > Date.parse(current.retryUntil)
      ) {
        return null;
      }
      return transition(current, current.retryTarget, action.at, {
        actualStart: current.retryTarget === 'recording' ? action.at : current.actualStart,
        actualEnd: current.retryTarget === 'recording' ? undefined : current.actualEnd,
        failureCode: undefined,
        retryUntil: undefined,
        retryTarget: undefined,
      });
    case 'expire':
      return transition(current, 'expired', action.at, {
        retryUntil: undefined,
        retryTarget: undefined,
      });
    case 'discard': {
      const pauseIntervals =
        current.status === 'paused'
          ? closeOpenPauseInterval(current.pauseIntervals, action.at)
          : current.pauseIntervals;
      if (pauseIntervals === null) {
        return null;
      }
      return transition(current, 'discarded', action.at, {
        actualEnd:
          current.actualStart !== undefined && current.actualEnd === undefined
            ? action.at
            : current.actualEnd,
        pauseIntervals,
      });
    }
  }
}

export const reduceRecordingSession = recordingSessionReducer;

function transition(
  current: RecordingSession,
  target: RecordingSessionStatus,
  at: UtcTimestamp,
  changes: Partial<RecordingSession> = {},
): RecordingSession | null {
  if (!RECORDING_SESSION_TRANSITIONS[current.status].includes(target)) {
    return null;
  }
  const next = validateCandidate({
    ...current,
    ...changes,
    status: target,
    updatedAt: at,
  });
  return next;
}

function validateCandidate(value: RecordingSession): RecordingSession | null {
  const candidate = validSession(value);
  if (candidate === null) {
    return null;
  }
  if (
    candidate.actualStart !== undefined &&
    candidate.actualEnd !== undefined &&
    Date.parse(candidate.actualEnd) < Date.parse(candidate.actualStart)
  ) {
    return null;
  }
  return candidate;
}

function validSession(value: RecordingSession): RecordingSession | null {
  try {
    const session = validateRecordingSession(value);
    const timestamps = [
      session.scheduledStart,
      session.scheduledEnd,
      session.actualStart,
      session.actualEnd,
      session.retryUntil,
      session.createdAt,
      session.updatedAt,
      ...session.pauseIntervals.flatMap((interval) => [interval.startedAt, interval.endedAt]),
    ];
    return timestamps.every(
      (timestamp): timestamp is string => timestamp === undefined || isValidUtcTimestamp(timestamp),
    )
      ? session
      : null;
  } catch {
    return null;
  }
}

function isValidUtcTimestamp(value: string): boolean {
  if (!UTC_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    return false;
  }
  return new Date(Date.parse(value)).toISOString() === value;
}

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

function hasOpenPauseInterval(intervals: readonly PauseInterval[]): boolean {
  return intervals.some((interval) => interval.endedAt === undefined);
}

function closeOpenPauseInterval(
  intervals: readonly PauseInterval[],
  endedAt: UtcTimestamp,
): PauseInterval[] | null {
  const openIndexes = intervals
    .map((interval, index) => (interval.endedAt === undefined ? index : -1))
    .filter((index) => index >= 0);
  if (openIndexes.length !== 1) {
    return null;
  }
  const openIndex = openIndexes[0];
  const interval = intervals[openIndex];
  if (Date.parse(endedAt) < Date.parse(interval.startedAt)) {
    return null;
  }
  return intervals.map((item, index) => (index === openIndex ? { ...item, endedAt } : { ...item }));
}
