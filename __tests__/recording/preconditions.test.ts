import {
  checkStartPreconditions,
  MIN_FREE_STORAGE_BYTES,
} from '../../src/features/recording/preconditions';
import { createHarness, makeVoiceProfile, permission } from './testKit';

async function check(
  options: {
    response?: ReturnType<typeof permission>;
    voice?: 'ready' | 'pending' | 'none';
    freeBytes?: number;
  } = {},
) {
  const { repositories, disk } = await createHarness();
  const { response = permission(), voice = 'ready', freeBytes = MIN_FREE_STORAGE_BYTES } = options;
  await repositories.voiceProfiles.deleteById(makeVoiceProfile().id);
  if (voice !== 'none') {
    await repositories.voiceProfiles.save(makeVoiceProfile({ status: voice }));
  }
  disk.freeBytes = freeBytes;
  return checkStartPreconditions({
    repositories,
    native: { getRecordingPermissionsAsync: async () => response },
    files: disk.recordingFiles,
  });
}

describe('checkStartPreconditions', () => {
  it('allows recording when permission, voice profile and storage are all present', async () => {
    await expect(check()).resolves.toBeNull();
  });

  it('reports denied permission', async () => {
    await expect(
      check({ response: permission({ granted: false, status: 'denied', canAskAgain: true }) }),
    ).resolves.toBe('permission-denied');
  });

  it('reports a permission that was not asked yet as denied', async () => {
    await expect(
      check({
        response: permission({ granted: false, status: 'undetermined', canAskAgain: true }),
      }),
    ).resolves.toBe('permission-denied');
  });

  it('reports blocked permission when the OS will not ask again', async () => {
    await expect(
      check({ response: permission({ granted: false, status: 'denied', canAskAgain: false }) }),
    ).resolves.toBe('permission-blocked');
  });

  it('reports a missing voice profile, including one that is not ready yet', async () => {
    await expect(check({ voice: 'none' })).resolves.toBe('voice-profile-missing');
    await expect(check({ voice: 'pending' })).resolves.toBe('voice-profile-missing');
  });

  it('reports low storage just below the minimum', async () => {
    await expect(check({ freeBytes: MIN_FREE_STORAGE_BYTES - 1 })).resolves.toBe('low-storage');
  });

  it('reports permission before voice profile before storage', async () => {
    await expect(
      check({
        response: permission({ granted: false, status: 'denied', canAskAgain: false }),
        voice: 'none',
        freeBytes: 0,
      }),
    ).resolves.toBe('permission-blocked');
    await expect(check({ voice: 'none', freeBytes: 0 })).resolves.toBe('voice-profile-missing');
  });
});
