import {
  RECORDING_INTENT_KINDS,
  RECORDING_INTENT_SOURCES,
  RECORDING_INTENT_VERSION,
  isRecordingIntentRecord,
  parseRecordingIntentRecord,
} from '../../../src/features/recording/controls/intents';

const valid = {
  version: 1,
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'pause' as const,
  sessionId: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-03-10T09:00:00.000Z',
  source: 'ios-activity' as const,
};

describe('recording intent record', () => {
  it('parses a valid record to exactly the six contract fields', () => {
    const parsed = parseRecordingIntentRecord(valid);

    expect(parsed).toEqual(valid);
    expect(Object.keys(parsed ?? {})).toEqual([
      'version',
      'id',
      'kind',
      'sessionId',
      'createdAt',
      'source',
    ]);
  });

  it('drops content keys and any other extra fields without mutating the input', () => {
    const input = {
      ...valid,
      transcript: 'private words',
      journal: { title: 'private' },
      prompt: 'private prompt',
      speaker: 'private speaker',
      audioPath: '/private/audio.m4a',
      audio_path: '/private/audio.m4a',
      extra: true,
    };
    const snapshot = { ...input };

    const parsed = parseRecordingIntentRecord(input);

    expect(parsed).toEqual(valid);
    for (const key of [
      'transcript',
      'journal',
      'prompt',
      'speaker',
      'audioPath',
      'audio_path',
      'extra',
    ]) {
      expect(parsed).not.toHaveProperty(key);
    }
    expect(input).toEqual(snapshot);
  });

  it('accepts UUID versions 1 through 5 case-insensitively', () => {
    for (const version of [1, 2, 3, 4, 5]) {
      const record = {
        ...valid,
        id: `AAAAAAAA-AAAA-${version}AAA-8AAA-AAAAAAAAAAAA`,
        sessionId: `BBBBBBBB-BBBB-${version}BBB-9BBB-BBBBBBBBBBBB`,
      };

      expect(parseRecordingIntentRecord(record)).toEqual(record);
    }
  });

  it('exposes the contract constants', () => {
    expect(RECORDING_INTENT_VERSION).toBe(1);
    expect(RECORDING_INTENT_KINDS).toEqual(['pause', 'resume', 'stop']);
    expect(RECORDING_INTENT_SOURCES).toEqual(['ios-activity', 'android-notification']);
  });

  it.each([
    ['a non-object string', 'record'],
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
    ['an array', []],
    ['an empty object', {}],
    ['a missing version', { ...valid, version: undefined }],
    ['a wrong version', { ...valid, version: 2 }],
    ['a string version', { ...valid, version: '1' }],
    ['a missing kind', { ...valid, kind: undefined }],
    ['an unknown kind', { ...valid, kind: 'play' }],
    ['a missing source', { ...valid, source: undefined }],
    ['an unknown source', { ...valid, source: 'widget' }],
    ['a missing id', { ...valid, id: undefined }],
    ['a non-UUID id', { ...valid, id: 'not-a-uuid' }],
    ['an id with a version above 5', { ...valid, id: '11111111-1111-6111-8111-111111111111' }],
    ['an id with a bad variant', { ...valid, id: '11111111-1111-4111-c111-111111111111' }],
    ['a missing session id', { ...valid, sessionId: undefined }],
    ['a non-UUID session id', { ...valid, sessionId: 'not-a-uuid' }],
    ['a non-string timestamp', { ...valid, createdAt: 1_772_000_000_000 }],
    ['a timestamp without Z', { ...valid, createdAt: '2026-03-10T09:00:00.000' }],
    ['a timestamp that is not a date', { ...valid, createdAt: 'not-a-dateZ' }],
  ])('rejects %s', (_label, value) => {
    expect(parseRecordingIntentRecord(value)).toBeNull();
    expect(isRecordingIntentRecord(value)).toBe(false);
  });

  it('narrows a valid record with the type guard', () => {
    expect(isRecordingIntentRecord(valid)).toBe(true);
  });
});
