import { createDefaultAppPreferences } from '../../src/features/preferences';
import {
  createProcessingHost,
  RETRY_BASE_MS,
  RETRY_CAP_MS,
  retryDelayMs,
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

  it('retries a transient failure after 30 s, then waits 60 s', async () => {
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

  it('never retries at or after retryUntil', async () => {
    const fixture = await createProcessingFixture({
      analysis: { status: 'failed', code: 'network' },
    });
    const { host } = createHost(fixture);

    await host.kick(SESSION_ID);
    const failed = await fixture.session();
    const deadline = new Date(failed.retryUntil!);
    fixture.setNow(deadline);

    await host.reconcile(deadline);

    expect(fixture.analyzeCalls).toHaveLength(1);
    expect((await fixture.session()).status).toBe('failed');
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
    detach();
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
