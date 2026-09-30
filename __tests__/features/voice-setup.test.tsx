import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { VoiceSetupScreen } from '../../src/features/voice/VoiceSetupScreen';
import {
  VOICE_MODEL_VERSION,
  type SpeakerEmbeddingProvider,
} from '../../src/features/voice/enrollment';
import type { VoiceProfile } from '../../src/storage/types';

function createRepository() {
  let profile: VoiceProfile | null = null;
  return {
    getById: jest.fn(async () => profile),
    findById: jest.fn(async () => profile),
    list: jest.fn(async () => (profile === null ? [] : [profile])),
    save: jest.fn(async (next: VoiceProfile) => {
      profile = next;
      return next;
    }),
    deleteById: jest.fn(async () => {
      profile = null;
    }),
    getProfile: () => profile,
  };
}

const PREPARING_COPY =
  'Preparing the on-device voice model. This one-time download can take a minute.';

describe('voice setup surface', () => {
  it('guides three samples, persists only at completion, and supports delete/retry', async () => {
    const repository = createRepository();
    const provider: SpeakerEmbeddingProvider = {
      modelVersion: VOICE_MODEL_VERSION,
      embeddingFromFile: jest.fn(async () => [1, 0]),
    };
    const sampleRecorder = {
      recordSample: jest.fn(async () => 'cache://sample.m4a'),
      discard: jest.fn(async () => undefined),
    };
    const onComplete = jest.fn(async () => undefined);
    const screen = await render(
      <VoiceSetupScreen
        now={() => '2026-09-26T00:00:00.000Z'}
        onComplete={onComplete}
        profileRepository={repository}
        sampleRecorder={sampleRecorder}
        speakerProvider={provider}
      />,
    );

    expect(screen.getByText('Sample 1 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByText('Record sample 1'));
    await waitFor(() => expect(screen.getByText('Sample 2 of 3')).toBeTruthy());
    await fireEvent.press(screen.getByText('Record sample 2'));
    await waitFor(() => expect(screen.getByText('Sample 3 of 3')).toBeTruthy());
    await fireEvent.press(screen.getByText('Record sample 3'));
    await waitFor(() => expect(screen.getByText('Voice profile ready')).toBeTruthy());

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(sampleRecorder.discard).toHaveBeenCalledTimes(3);

    await fireEvent.press(screen.getAllByText('Delete and retry')[1]);
    await waitFor(() => expect(screen.getByText('Sample 3 of 3')).toBeTruthy());
    expect(repository.deleteById).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000005');
    expect(repository.getProfile()).toBeNull();
  });

  it('shows the model download state before recording and only records once it is ready', async () => {
    let finishPreparing: () => void = () => undefined;
    const provider: SpeakerEmbeddingProvider = {
      modelVersion: VOICE_MODEL_VERSION,
      prepare: jest.fn(() => new Promise<void>((resolve) => (finishPreparing = resolve))),
      embeddingFromFile: jest.fn(async () => [1, 0]),
    };
    const sampleRecorder = {
      recordSample: jest.fn(async () => 'cache://sample.m4a'),
      discard: jest.fn(async () => undefined),
    };
    const screen = await render(
      <VoiceSetupScreen
        profileRepository={createRepository()}
        sampleRecorder={sampleRecorder}
        speakerProvider={provider}
      />,
    );

    expect(screen.queryByText(PREPARING_COPY)).toBeNull();
    await fireEvent.press(screen.getByText('Record sample 1'));
    await waitFor(() => expect(screen.getByText(PREPARING_COPY)).toBeTruthy());
    expect(sampleRecorder.recordSample).not.toHaveBeenCalled();

    finishPreparing();
    await waitFor(() => expect(screen.getByText('Sample 2 of 3')).toBeTruthy());
    expect(screen.queryByText(PREPARING_COPY)).toBeNull();
    expect(sampleRecorder.recordSample).toHaveBeenCalledTimes(1);
  });

  it('reports a failed model download and lets the user retry it', async () => {
    const provider: SpeakerEmbeddingProvider = {
      modelVersion: VOICE_MODEL_VERSION,
      prepare: jest
        .fn<Promise<void>, []>()
        .mockRejectedValueOnce(new Error('The voice model could not be downloaded.'))
        .mockResolvedValue(undefined),
      embeddingFromFile: jest.fn(async () => [1, 0]),
    };
    const sampleRecorder = {
      recordSample: jest.fn(async () => 'cache://sample.m4a'),
      discard: jest.fn(async () => undefined),
    };
    const screen = await render(
      <VoiceSetupScreen
        profileRepository={createRepository()}
        sampleRecorder={sampleRecorder}
        speakerProvider={provider}
      />,
    );

    await fireEvent.press(screen.getByText('Record sample 1'));
    await waitFor(() =>
      expect(screen.getByText('The voice model could not be downloaded.')).toBeTruthy(),
    );
    expect(sampleRecorder.recordSample).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Retry voice model'));
    await waitFor(() => expect(screen.getByText('Sample 2 of 3')).toBeTruthy());
    expect(screen.queryByText('The voice model could not be downloaded.')).toBeNull();
    expect(screen.getByText('Record sample 2')).toBeTruthy();
    expect(provider.prepare).toHaveBeenCalledTimes(2);
  });
});
