import {
  MAX_RETRY_WINDOW_MS,
  recordingSessionReducer,
  RECORDING_SESSION_TRANSITIONS,
  type RecordingSessionAction,
} from '../../src/state/recordingSessionReducer';
import type {
  RecordingSession,
  RecordingSessionRetryTarget,
  RecordingSessionStatus,
} from '../../src/storage/types';

const t0 = '2026-01-01T00:00:00.000Z';
const t1 = '2026-01-01T00:01:00.000Z';
const t2 = '2026-01-01T00:02:00.000Z';
const t3 = '2026-01-01T00:03:00.000Z';
const t4 = '2026-01-01T00:04:00.000Z';

function makeSession(
  status: RecordingSessionStatus,
  retryTarget?: RecordingSessionRetryTarget,
): RecordingSession {
  const started = status !== 'scheduled' ? t1 : undefined;
  const paused = status === 'paused';
  return {
    id: '11111111-1111-4111-8111-111111111111',
    scheduledStart: t0,
    scheduledEnd: '2026-01-01T01:00:00.000Z',
    actualStart: started,
    actualEnd: undefined,
    timezone: 'UTC',
    status,
    pauseIntervals: paused ? [{ startedAt: t2 }] : [],
    failureCode: status === 'failed' ? 'interrupted' : undefined,
    retryUntil: retryTarget === undefined ? undefined : t4,
    retryTarget,
    createdAt: t0,
    updatedAt: t0,
  };
}

function actionFor(
  status: RecordingSessionStatus,
  target: RecordingSessionStatus,
): RecordingSessionAction {
  if (target === 'expired') {
    return { type: 'expire', at: t2 };
  }
  if (status === 'failed') {
    return { type: 'retry', at: t2 };
  }
  if (target === 'recording') {
    return status === 'paused' ? { type: 'resume', at: t3 } : { type: 'start', at: t1 };
  }
  if (target === 'paused') {
    return { type: 'pause', at: t2 };
  }
  if (target === 'transcribing') {
    return { type: 'stop', at: t3 };
  }
  if (target === 'failed') {
    return {
      type: 'fail',
      at: t2,
      failureCode: 'interrupted',
      retryUntil: t4,
      retryTarget: 'transcribing',
    };
  }
  if (target === 'discarded') {
    return { type: 'discard', at: t2 };
  }
  return {
    type: 'advance',
    to: target as 'analyzing' | 'awaiting clarification' | 'generating' | 'ready',
    at: t2,
  };
}

describe('recordingSessionReducer', () => {
  it('accepts every edge in the canonical transition matrix', () => {
    for (const status of Object.keys(RECORDING_SESSION_TRANSITIONS) as RecordingSessionStatus[]) {
      for (const target of RECORDING_SESSION_TRANSITIONS[status]) {
        const retryTarget =
          status === 'failed' && target !== 'expired'
            ? (target as RecordingSessionRetryTarget)
            : undefined;
        const next = recordingSessionReducer(
          makeSession(status, retryTarget),
          actionFor(status, target),
        );
        expect(next?.status).toBe(target);
      }
    }
  });

  it('rejects every forbidden concrete command without mutating the source', () => {
    const actions: RecordingSessionAction[] = [
      { type: 'start', at: t1 },
      { type: 'pause', at: t2 },
      { type: 'resume', at: t2 },
      { type: 'stop', at: t2 },
      { type: 'scheduled-end', at: t2 },
      { type: 'advance', to: 'analyzing', at: t2 },
      { type: 'advance', to: 'awaiting clarification', at: t2 },
      { type: 'advance', to: 'generating', at: t2 },
      { type: 'advance', to: 'ready', at: t2 },
      { type: 'fail', at: t2, failureCode: 'interrupted' },
      { type: 'expire', at: t2 },
      { type: 'discard', at: t2 },
    ];
    const actionTargets = new Map<RecordingSessionAction['type'], RecordingSessionStatus>([
      ['start', 'recording'],
      ['pause', 'paused'],
      ['resume', 'recording'],
      ['stop', 'transcribing'],
      ['scheduled-end', 'transcribing'],
      ['advance', 'analyzing'],
      ['fail', 'failed'],
      ['expire', 'expired'],
      ['discard', 'discarded'],
    ]);

    for (const status of Object.keys(RECORDING_SESSION_TRANSITIONS) as RecordingSessionStatus[]) {
      for (const action of actions) {
        const source = makeSession(status);
        const target = action.type === 'advance' ? action.to : actionTargets.get(action.type);
        if (target !== undefined && RECORDING_SESSION_TRANSITIONS[status].includes(target)) {
          continue;
        }
        expect(recordingSessionReducer(source, action)).toBeNull();
        expect(source).toEqual(makeSession(status));
      }
    }
  });

  it('records pause/resume intervals and stops or scheduled-ends into transcribing', () => {
    const recording = recordingSessionReducer(makeSession('scheduled'), {
      type: 'start',
      at: t1,
    });
    const paused = recordingSessionReducer(recording!, { type: 'pause', at: t2 });
    expect(paused?.pauseIntervals).toEqual([{ startedAt: t2 }]);

    const resumed = recordingSessionReducer(paused!, { type: 'resume', at: t3 });
    expect(resumed?.pauseIntervals).toEqual([{ startedAt: t2, endedAt: t3 }]);

    const ended = recordingSessionReducer(resumed!, { type: 'scheduled-end', at: t4 });
    expect(ended?.status).toBe('transcribing');
    expect(ended?.actualEnd).toBe(t4);
  });

  it('records interruption metadata and retries only to the persisted target', () => {
    const failed = recordingSessionReducer(makeSession('recording'), {
      type: 'fail',
      at: t2,
      failureCode: 'microphone_interrupted',
      retryUntil: t4,
      retryTarget: 'transcribing',
    });
    expect(failed).toMatchObject({
      status: 'failed',
      failureCode: 'microphone_interrupted',
      retryUntil: t4,
      retryTarget: 'transcribing',
      actualEnd: t2,
    });
    expect(recordingSessionReducer(failed!, { type: 'start', at: t3 })).toBeNull();
    expect(recordingSessionReducer(failed!, { type: 'retry', at: t3 })).toMatchObject({
      status: 'transcribing',
      failureCode: undefined,
      retryUntil: undefined,
      retryTarget: undefined,
    });
    expect(
      recordingSessionReducer(failed!, { type: 'retry', at: '2026-01-01T00:05:00.000Z' }),
    ).toBeNull();
    expect(recordingSessionReducer(failed!, { type: 'expire', at: t4 })?.status).toBe('expired');
    expect(recordingSessionReducer(makeSession('failed'), { type: 'retry', at: t3 })).toBeNull();
  });

  it('accepts exactly 24 hours and rejects invalid retry metadata or longer windows', () => {
    const exactDeadline = new Date(Date.parse(t2) + MAX_RETRY_WINDOW_MS).toISOString();
    const tooLateDeadline = new Date(Date.parse(t2) + MAX_RETRY_WINDOW_MS + 1).toISOString();

    expect(
      recordingSessionReducer(makeSession('recording'), {
        type: 'fail',
        at: t2,
        failureCode: 'interrupted',
        retryTarget: 'transcribing',
        retryUntil: exactDeadline,
      })?.retryUntil,
    ).toBe(exactDeadline);
    expect(
      recordingSessionReducer(makeSession('recording'), {
        type: 'fail',
        at: t2,
        failureCode: 'interrupted',
        retryTarget: 'transcribing',
        retryUntil: tooLateDeadline,
      }),
    ).toBeNull();
    expect(
      recordingSessionReducer(makeSession('recording'), {
        type: 'fail',
        at: t2,
        failureCode: 'interrupted',
        retryTarget: 'transcribing',
      }),
    ).toBeNull();
    expect(
      recordingSessionReducer(makeSession('recording'), {
        type: 'fail',
        at: t2,
        failureCode: 'interrupted',
        retryUntil: t4,
      }),
    ).toBeNull();
    expect(
      recordingSessionReducer(
        { ...makeSession('failed'), retryUntil: t4 },
        { type: 'retry', at: t3 },
      ),
    ).toBeNull();
  });

  it('rejects stale, malformed, and terminal actions', () => {
    expect(
      recordingSessionReducer(makeSession('recording'), {
        type: 'pause',
        at: '2025-12-31T23:59:00.000Z',
      }),
    ).toBeNull();
    expect(
      recordingSessionReducer(makeSession('scheduled'), {
        type: 'start',
        at: '2026-02-31T00:00:00.000Z',
      }),
    ).toBeNull();
    expect(
      recordingSessionReducer(makeSession('recording'), {
        type: 'fail',
        at: t3,
        failureCode: 'interrupted',
        retryUntil: t2,
      }),
    ).toBeNull();

    for (const status of ['ready', 'expired', 'discarded'] as const) {
      expect(recordingSessionReducer(makeSession(status), { type: 'expire', at: t1 })).toBeNull();
    }
  });
});
