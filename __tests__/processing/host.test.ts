import { createDefaultAppPreferences } from '../../src/features/preferences';
import {
  createProcessingHost,
  RECONCILE_STALE_MS,
  RETRY_BASE_MS,
  RETRY_CAP_MS,
  retryDelayMs,
  type AnalyzeResult,
  type ProcessingHost,
} from '../../src/features/processing';
import type { JournalApiClient } from '../../src/services/journalApi';
import { useSessionStore } from '../../src/state/session';
import type { RecordingSession } from '../../src/storage/types';
import {
  analyzedEvent,
  analyzedQuestion,
  analyzedResponse,
  createProcessingFixture,
  SESSION_ID,
  NOW,
  type ProcessingFixture,
} from './kit';

// The receipt hash defaults to expo-crypto, whose native digest is unavailable under jest-expo.
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  digestStringAsync: async () => 'a'.repeat(64),
}));

type HostFixture = {
  fixture: ProcessingFixture;
  host: ProcessingHost;
  published: RecordingSession[];
};

function createHost(fixture: ProcessingFixture): HostFixture {
  const published: RecordingSession[] = [];
  const client: JournalApiClient = {
    analyze: fixture.deps.analyze as JournalApiClient['analyze'],
    generate: fixture.deps.generate as JournalApiClient['generate'],
  };
  const host = createProcessingHost({
    getStorage: () => fixture,
    getClient: () => client,
    transcribe: fixture.deps.transcribe,
    now: fixture.deps.now,
    uuid: fixture.deps.uuid,
    publish: (session) => published.push(session),
  });
  return { fixture, host, published };
}

async function waitForStatus(fixture: ProcessingFixture, status: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await fixture.session()).status === status) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`session never became ${status}`);
}

describe('processing host', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession();
  });

  afterEach(() => {
    useSessionStore.getState().resetSession();
  });

  it('runs one transcribe and one analyze for two concurrent kicks', async () => {
    const fixture = await createProcessingFixture({
      analysis: analyzedResponse({
        events: [analyzedEvent()],
        questions: [analyzedQuestion()],
      }),
    });
    const { host, published } = createHost(fixture);

    await Promise.all([host.kick(SESSION_ID), host.kick(SESSION_ID)]);

    expect(fixture.transcribeCalls).toEqual([SESSION_ID]);
    expect(fixture.analyzeCalls).toHaveLength(1);
    expect(published.map((session) => session.status)).toEqual(['awaiting clarification']);
    expect((await fixture.session()).status).toBe('awaiting clarification');
  });

  it('generates the journal and clears source records when analysis asks nothing', async () => {
    const fixture = await createProcessingFixture({
      analysis: analyzedResponse({ events: [analyzedEvent()], questions: [] }),
    });
    const { host, published } = createHost(fixture);

    await host.kick(SESSION_ID);

    expect(fixture.generateCalls).toHaveLength(1);
    expect(published.map((session) => session.status)).toEqual(['generating', 'ready']);
    expect((await fixture.session()).status).toBe('ready');
    expect(await fixture.repositories.findJournalEntryBySession(SESSION_ID)).not.toBeNull();
    expect(await fixture.repositories.listTranscriptSegmentsBySession(SESSION_ID)).toHaveLength(0);
    expect(await fixture.repositories.listExtractedEventsBySession(SESSION_ID)).toHaveLength(0);
  });

  it('leaves nothing saved when generation is rejected', async () => {
    const fixture = await createProcessingFixture({
      analysis: analyzedResponse({ events: [analyzedEvent()], questions: [] }),
      generation: { status: 'failed', code: 'invalid-response' },
    });
    const { host } = createHost(fixture);

    await host.kick(SESSION_ID);

    expect((await fixture.session()).status).toBe('failed');
    expect(await fixture.repositories.findJournalEntryBySession(SESSION_ID)).toBeNull();
    expect(await fixture.repositories.listTranscriptSegmentsBySession(SESSION_ID)).toHaveLength(1);
    expect(await fixture.repositories.listExtractedEventsBySession(SESSION_ID)).toHaveLength(1);
  });

  it('retries a transient failure after 30 s, 60 s, then 120 s', async () => {
    const fixture = await createProcessingFixture({
      analysis: { status: 'failed', code: 'network' },
    });
    const { host } = createHost(fixture);

    await host.kick(SESSION_ID);
    expect(await fixture.session()).toMatchObject({
      status: 'failed',
      failureCode: 'network',
      retryTarget: 'analyzing',
    });
    expect(fixture.analyzeCalls).toHaveLength(1);

    const at29 = new Date(NOW.getTime() + 29_000);
    fixture.setNow(at29);
    await host.reconcile(at29);
    expect(fixture.analyzeCalls).toHaveLength(1);

    const at30 = new Date(NOW.getTime() + RETRY_BASE_MS);
    fixture.setNow(at30);
    await host.reconcile(at30);
    expect(fixture.analyzeCalls).toHaveLength(2);

    const at89 = new Date(NOW.getTime() + 89_000);
    fixture.setNow(at89);
    await host.reconcile(at89);
    expect(fixture.analyzeCalls).toHaveLength(2);

    const at90 = new Date(NOW.getTime() + 90_000);
    fixture.setNow(at90);
    await host.reconcile(at90);
    expect(fixture.analyzeCalls).toHaveLength(3);

    const at209 = new Date(NOW.getTime() + 209_000);
    fixture.setNow(at209);
    await host.reconcile(at209);
    expect(fixture.analyzeCalls).toHaveLength(3);

    const at210 = new Date(NOW.getTime() + 210_000);
    fixture.setNow(at210);
    await host.reconcile(at210);
    expect(fixture.analyzeCalls).toHaveLength(4);
  });

  it.each(['invalid-response', 'app-check-rejected', 'api-unconfigured', 'payload-too-large'])(
    'does not auto-retry a %s failure',
    async (code) => {
      const fixture = await createProcessingFixture({
        analysis: { status: 'failed', code },
      });
      const { host } = createHost(fixture);

      await host.kick(SESSION_ID);
      expect((await fixture.session()).failureCode).toBe(code);

      const at30 = new Date(NOW.getTime() + RETRY_BASE_MS);
      fixture.setNow(at30);
      await host.reconcile(at30);

      expect(fixture.analyzeCalls).toHaveLength(1);
      expect((await fixture.session()).status).toBe('failed');
    },
  );

  it('never retries at or after retryUntil and keeps the retry material', async () => {
    const fixture = await createProcessingFixture({
      analysis: analyzedResponse({ events: [analyzedEvent()], questions: [] }),
      generation: { status: 'failed', code: 'network' },
    });
    const { host } = createHost(fixture);

    await host.kick(SESSION_ID);
    const failed = await fixture.session();
    expect(failed.retryTarget).toBe('generating');
    const deadline = new Date(failed.retryUntil!);
    fixture.setNow(deadline);

    await host.reconcile(deadline);

    expect(fixture.generateCalls).toHaveLength(1);
    expect((await fixture.session()).status).toBe('failed');
    expect(await fixture.repositories.listTranscriptSegmentsBySession(SESSION_ID)).toHaveLength(1);
    expect(await fixture.repositories.listExtractedEventsBySession(SESSION_ID)).toHaveLength(1);
  });

  it('ignores an overlapping reconcile while the first is still running', async () => {
    const fixture = await createProcessingFixture();
    let resolveAnalysis: ((result: AnalyzeResult) => void) | undefined;
    const analyze = jest.fn(
      () =>
        new Promise<AnalyzeResult>((resolve) => {
          resolveAnalysis = resolve;
        }),
    );
    fixture.deps.analyze = analyze;
    const { host } = createHost(fixture);
    const listSpy = jest.spyOn(fixture.repositories.recordingSessions, 'list');
    const at = new Date(NOW.getTime());

    const first = host.reconcile(at);
    const second = host.reconcile(at);
    await second;
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(fixture.transcribeCalls).toHaveLength(1);
    expect(analyze).toHaveBeenCalledTimes(1);

    resolveAnalysis!({ status: 'failed', code: 'network' });
    await first;

    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledTimes(1);

    // The guard resets after a normal pass, so the next tick reconciles again.
    await host.reconcile(new Date(NOW.getTime() + 1));
    expect(listSpy).toHaveBeenCalledTimes(2);
  });

  it('overlaps a reconcile pass that has hung past the stale bound', async () => {
    const fixture = await createProcessingFixture({
      analysis: analyzedResponse({ questions: [analyzedQuestion()] }),
    });
    const { host } = createHost(fixture);
    const listSpy = jest
      .spyOn(fixture.repositories.recordingSessions, 'list')
      .mockImplementationOnce(() => new Promise<RecordingSession[]>(() => undefined));
    const at = new Date(NOW.getTime());

    void host.reconcile(at);
    await host.reconcile(new Date(at.getTime() + RECONCILE_STALE_MS - 1));
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(fixture.transcribeCalls).toHaveLength(0);

    await host.reconcile(new Date(at.getTime() + RECONCILE_STALE_MS));
    expect(listSpy).toHaveBeenCalledTimes(2);
    expect(fixture.transcribeCalls).toHaveLength(1);
    expect((await fixture.session()).status).toBe('awaiting clarification');
  });

  it('retries a retryable failed session on the first reconcile of a fresh host', async () => {
    const fixture = await createProcessingFixture({
      analysis: { status: 'failed', code: 'network' },
    });
    const first = createHost(fixture);
    await first.host.kick(SESSION_ID);
    expect(fixture.analyzeCalls).toHaveLength(1);

    fixture.setAnalysis(analyzedResponse({ questions: [analyzedQuestion()] }));
    const at = new Date(NOW.getTime() + 5_000);
    fixture.setNow(at);
    const second = createHost(fixture);

    await second.host.reconcile(at);

    expect(fixture.analyzeCalls).toHaveLength(2);
    expect((await fixture.session()).status).toBe('awaiting clarification');
  });

  it('kicks a session already processing when it attaches', async () => {
    const fixture = await createProcessingFixture({
      analysis: analyzedResponse({ questions: [] }),
    });
    const { host } = createHost(fixture);
    useSessionStore
      .getState()
      .setRecordingSession({ ...(await fixture.session()), status: 'generating' });

    const detach = host.attach();
    await waitForStatus(fixture, 'ready');

    expect(fixture.generateCalls).toHaveLength(1);

    // Put the persisted session back in processing so a surviving subscription would kick again.
    const ready = await fixture.session();
    await fixture.repositories.recordingSessions.save({ ...ready, status: 'generating' });
    detach();
    useSessionStore.getState().setRecordingSession({ ...ready, status: 'analyzing' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(fixture.generateCalls).toHaveLength(1);
  });

  it('kicks on a store change into processing and ignores unrelated updates', async () => {
    const fixture = await createProcessingFixture({
      analysis: analyzedResponse({ questions: [] }),
    });
    const { host } = createHost(fixture);
    const session = await fixture.session();
    useSessionStore
      .getState()
      .setRecordingSession({ ...session, status: 'awaiting clarification' });
    const detach = host.attach();

    useSessionStore
      .getState()
      .setAppPreferences(createDefaultAppPreferences('2026-03-10T00:00:00.000Z', 'UTC'));
    expect(fixture.transcribeCalls).toHaveLength(0);
    expect(fixture.generateCalls).toHaveLength(0);

    useSessionStore.getState().setRecordingSession({ ...session, status: 'generating' });
    await waitForStatus(fixture, 'ready');

    expect(fixture.generateCalls).toHaveLength(1);
    detach();
  });

  it('caps the retry delay at 15 minutes', () => {
    expect(retryDelayMs(0)).toBe(30_000);
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(10)).toBe(RETRY_CAP_MS);
  });
});
