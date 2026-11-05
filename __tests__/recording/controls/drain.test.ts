import {
  drainRecordingIntents,
  RECORDING_INTENT_MAX_AGE_MS,
  RECORDING_RESUME_MAX_AGE_MS,
} from '../../../src/features/recording/controls/drain';
import type { RecordingIntentRecord } from '../../../src/features/recording/controls/intents';
import type { CommandFailure, CommandResult } from '../../../src/features/recording/engine';
import type { RecordingSession, RecordingSessionStatus } from '../../../src/storage/types';
import { makeScheduledSession, SESSION_ID } from '../testKit';

const OTHER_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-03-10T12:00:00.000Z');

function intentId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

function makeRecord(overrides: Partial<RecordingIntentRecord> = {}): RecordingIntentRecord {
  return {
    version: 1,
    id: intentId(1),
    kind: 'pause',
    sessionId: SESSION_ID,
    createdAt: new Date(NOW.getTime() - 60_000).toISOString(),
    source: 'ios-activity',
    ...overrides,
  };
}

function makeSession(status: RecordingSessionStatus): RecordingSession {
  return makeScheduledSession({ id: SESSION_ID, status });
}

function ok(session: RecordingSession): CommandResult {
  return { ok: true, session };
}

function failure(code: CommandFailure, session: RecordingSession | null = null): CommandResult {
  return { ok: false, code, session };
}

function createStore(records: unknown[] = []) {
  return {
    read: jest.fn(async () => records),
    remove: jest.fn(async (_ids: string[]) => undefined),
  };
}

function engineWith(result: CommandResult) {
  return {
    pause: jest.fn(async () => result),
    resume: jest.fn(async () => result),
    stop: jest.fn(async () => result),
  };
}

type FakeStore = ReturnType<typeof createStore>;
type FakeEngine = ReturnType<typeof engineWith>;

function drain(
  store: FakeStore,
  engine: FakeEngine,
  session: RecordingSession | null,
  foreground = true,
  now = NOW,
) {
  return drainRecordingIntents({
    store,
    engine,
    getSession: () => session,
    isForeground: () => foreground,
    now: () => now,
  });
}

describe('drainRecordingIntents', () => {
  it('returns no outcomes for an empty store', async () => {
    const store = createStore();
    const engine = engineWith(ok(makeSession('recording')));

    await expect(drain(store, engine, makeSession('recording'))).resolves.toEqual([]);
    expect(store.read).toHaveBeenCalledTimes(1);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it('returns no outcomes when the store read throws', async () => {
    const store = createStore();
    store.read.mockRejectedValueOnce(new Error('native failure'));
    const engine = engineWith(ok(makeSession('recording')));

    await expect(drain(store, engine, makeSession('recording'))).resolves.toEqual([]);
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.resume).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it('reports an invalid record and removes it when it has a removable id', async () => {
    const record = { ...makeRecord(), version: 2 };
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('recording')));

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'invalid', status: 'invalid' }]);
    expect(store.remove).toHaveBeenCalledWith([record.id]);
    expect(engine.pause).not.toHaveBeenCalled();
  });

  it('reports an invalid record without a removable id and skips removal', async () => {
    const record = { ...makeRecord(), id: 42 };
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('recording')));

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes).toEqual([{ id: '', kind: 'invalid', status: 'invalid' }]);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it('applies pause from recording and removes the record', async () => {
    const record = makeRecord({ kind: 'pause' });
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('paused')));

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'pause', status: 'applied' }]);
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(engine.resume).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith([record.id]);
  });

  it('treats pause from paused as a no-op', async () => {
    const record = makeRecord({ kind: 'pause' });
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('paused')));

    const outcomes = await drain(store, engine, makeSession('paused'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'pause', status: 'noop' }]);
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith([record.id]);
  });

  it('applies resume from paused', async () => {
    const record = makeRecord({ kind: 'resume' });
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('recording')));

    const outcomes = await drain(store, engine, makeSession('paused'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'resume', status: 'applied' }]);
    expect(engine.resume).toHaveBeenCalledTimes(1);
    expect(engine.pause).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith([record.id]);
  });

  it('treats resume from recording as a no-op', async () => {
    const record = makeRecord({ kind: 'resume' });
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('recording')));

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'resume', status: 'noop' }]);
    expect(engine.resume).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith([record.id]);
  });

  it('applies stop from recording', async () => {
    const record = makeRecord({ kind: 'stop' });
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('transcribing')));

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'stop', status: 'applied' }]);
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(engine.pause).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith([record.id]);
  });

  it('treats an idempotent stop from transcribing as a no-op', async () => {
    const record = makeRecord({ kind: 'stop' });
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('transcribing')));

    const outcomes = await drain(store, engine, makeSession('transcribing'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'stop', status: 'noop' }]);
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith([record.id]);
  });

  it('maps a rejected engine result to noop', async () => {
    const record = makeRecord({ kind: 'pause' });
    const store = createStore([record]);
    const engine = engineWith(failure('rejected', makeSession('scheduled')));

    const outcomes = await drain(store, engine, makeSession('scheduled'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'pause', status: 'noop' }]);
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith([record.id]);
  });

  it('maps a not-found engine result to unknown-session and removes the record', async () => {
    const record = makeRecord({ kind: 'pause' });
    const store = createStore([record]);
    const engine = engineWith(failure('not-found'));

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'pause', status: 'unknown-session' }]);
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith([record.id]);
  });

  it('removes a record for a different session as unknown-session', async () => {
    const record = makeRecord({ sessionId: OTHER_SESSION_ID });
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('paused')));

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'pause', status: 'unknown-session' }]);
    expect(engine.pause).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith([record.id]);
  });

  it('removes a record as unknown-session when there is no current session', async () => {
    const record = makeRecord();
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('paused')));

    const outcomes = await drain(store, engine, null);

    expect(outcomes).toEqual([{ id: record.id, kind: 'pause', status: 'unknown-session' }]);
    expect(engine.pause).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith([record.id]);
  });

  it('removes stale pause, stop, and resume records without running a command', async () => {
    const old = new Date(NOW.getTime() - RECORDING_INTENT_MAX_AGE_MS - 1).toISOString();
    const oldResume = new Date(NOW.getTime() - RECORDING_RESUME_MAX_AGE_MS - 1).toISOString();
    const records = [
      makeRecord({ id: intentId(1), kind: 'pause', createdAt: old }),
      makeRecord({ id: intentId(2), kind: 'stop', createdAt: old }),
      makeRecord({ id: intentId(3), kind: 'resume', createdAt: oldResume }),
    ];
    const store = createStore(records);
    const engine = engineWith(ok(makeSession('recording')));

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes.map((outcome) => outcome.status)).toEqual(['stale', 'stale', 'stale']);
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.resume).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledTimes(3);
    expect(store.remove).toHaveBeenCalledWith([records[0].id]);
    expect(store.remove).toHaveBeenCalledWith([records[1].id]);
    expect(store.remove).toHaveBeenCalledWith([records[2].id]);
  });

  it('does not treat a pause exactly at the max age as stale', async () => {
    const record = makeRecord({
      kind: 'pause',
      createdAt: new Date(NOW.getTime() - RECORDING_INTENT_MAX_AGE_MS).toISOString(),
    });
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('paused')));

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'pause', status: 'applied' }]);
    expect(engine.pause).toHaveBeenCalledTimes(1);
  });

  it('does not treat a resume exactly at the resume max age as stale', async () => {
    const record = makeRecord({
      kind: 'resume',
      createdAt: new Date(NOW.getTime() - RECORDING_RESUME_MAX_AGE_MS).toISOString(),
    });
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('recording')));

    const outcomes = await drain(store, engine, makeSession('paused'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'resume', status: 'applied' }]);
    expect(engine.resume).toHaveBeenCalledTimes(1);
  });

  it('defers a resume in the background and keeps the record', async () => {
    const record = makeRecord({ kind: 'resume' });
    const store = createStore([record]);
    const engine = engineWith(ok(makeSession('recording')));

    const outcomes = await drain(store, engine, makeSession('paused'), false);

    expect(outcomes).toEqual([{ id: record.id, kind: 'resume', status: 'deferred' }]);
    expect(engine.resume).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it('keeps a deferred resume while a later stop still applies', async () => {
    const deferred = makeRecord({
      id: intentId(1),
      kind: 'resume',
      createdAt: new Date(NOW.getTime() - 60_000).toISOString(),
    });
    const stop = makeRecord({
      id: intentId(2),
      kind: 'stop',
      createdAt: new Date(NOW.getTime() - 30_000).toISOString(),
    });
    const store = createStore([deferred, stop]);
    const engine = engineWith(ok(makeSession('transcribing')));

    const outcomes = await drain(store, engine, makeSession('recording'), false);

    expect(outcomes).toEqual([
      { id: deferred.id, kind: 'resume', status: 'deferred' },
      { id: stop.id, kind: 'stop', status: 'applied' },
    ]);
    expect(engine.resume).not.toHaveBeenCalled();
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith([stop.id]);
  });

  it('runs a duplicated id once and reports the extra copies once', async () => {
    const first = makeRecord({
      id: intentId(1),
      kind: 'pause',
      createdAt: new Date(NOW.getTime() - 60_000).toISOString(),
    });
    const second = makeRecord({
      id: intentId(1),
      kind: 'pause',
      createdAt: new Date(NOW.getTime() - 40_000).toISOString(),
    });
    const third = makeRecord({
      id: intentId(1),
      kind: 'pause',
      createdAt: new Date(NOW.getTime() - 20_000).toISOString(),
    });
    const store = createStore([first, second, third]);
    const engine = engineWith(ok(makeSession('paused')));

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes).toEqual([
      { id: first.id, kind: 'pause', status: 'applied' },
      { id: first.id, kind: 'pause', status: 'duplicate' },
    ]);
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith([first.id]);
  });

  it('applies records in createdAt order and reads the store once', async () => {
    const pause = makeRecord({
      id: intentId(1),
      kind: 'pause',
      createdAt: new Date(NOW.getTime() - 60_000).toISOString(),
    });
    const stop = makeRecord({
      id: intentId(2),
      kind: 'stop',
      createdAt: new Date(NOW.getTime() - 30_000).toISOString(),
    });
    const store = createStore([stop, pause]);
    const engine = {
      pause: jest.fn(async () => ok(makeSession('paused'))),
      resume: jest.fn(async () => ok(makeSession('recording'))),
      stop: jest.fn(async () => ok(makeSession('transcribing'))),
    };

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes).toEqual([
      { id: pause.id, kind: 'pause', status: 'applied' },
      { id: stop.id, kind: 'stop', status: 'applied' },
    ]);
    expect(engine.pause.mock.invocationCallOrder[0]).toBeLessThan(
      engine.stop.mock.invocationCallOrder[0],
    );
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  it('breaks createdAt ties by id ascending', async () => {
    const laterId = makeRecord({ id: intentId(2), kind: 'pause' });
    const earlierId = makeRecord({ id: intentId(1), kind: 'pause' });
    const store = createStore([laterId, earlierId]);
    const engine = engineWith(ok(makeSession('paused')));

    await drain(store, engine, makeSession('recording'));

    expect(store.remove.mock.calls.map(([ids]) => ids)).toEqual([[earlierId.id], [laterId.id]]);
  });

  it('marks a thrown command as failed, removes it, and keeps draining later records', async () => {
    const failing = makeRecord({
      id: intentId(1),
      kind: 'stop',
      createdAt: new Date(NOW.getTime() - 60_000).toISOString(),
    });
    const applying = makeRecord({
      id: intentId(2),
      kind: 'pause',
      createdAt: new Date(NOW.getTime() - 30_000).toISOString(),
    });
    const store = createStore([failing, applying]);
    const engine = {
      pause: jest.fn(async () => ok(makeSession('paused'))),
      resume: jest.fn(async () => ok(makeSession('recording'))),
      stop: jest.fn(async (): Promise<CommandResult> => {
        throw new Error('engine failure');
      }),
    };

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes).toEqual([
      { id: failing.id, kind: 'stop', status: 'failed' },
      { id: applying.id, kind: 'pause', status: 'applied' },
    ]);
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith([failing.id]);
    expect(store.remove).toHaveBeenCalledWith([applying.id]);
  });

  it('maps any other engine failure to failed and removes the record', async () => {
    const record = makeRecord({ kind: 'pause' });
    const store = createStore([record]);
    const engine = engineWith(failure('capture-failed'));

    const outcomes = await drain(store, engine, makeSession('recording'));

    expect(outcomes).toEqual([{ id: record.id, kind: 'pause', status: 'failed' }]);
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith([record.id]);
  });
});
