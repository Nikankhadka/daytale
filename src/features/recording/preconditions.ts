import { microphonePermissionState } from '../permissions';
import type { StorageRepositories } from '../../storage/repositories';
import type { RecordingFiles } from './files';
import type { RecordingNative } from './recorder';

/** 8 hours of capture is roughly 115 MB, so refuse to start (or continue) with less than 256 MB free. */
export const MIN_FREE_STORAGE_BYTES = 256 * 1024 * 1024;

export type StartBlocker =
  'permission-denied' | 'permission-blocked' | 'voice-profile-missing' | 'low-storage';

/** Returns the first reason recording cannot start, or null when it can. */
export async function checkStartPreconditions(dependencies: {
  repositories: Pick<StorageRepositories, 'voiceProfiles'>;
  native: Pick<RecordingNative, 'getRecordingPermissionsAsync'>;
  files: Pick<RecordingFiles, 'availableBytes'>;
}): Promise<StartBlocker | null> {
  const permission = microphonePermissionState(
    await dependencies.native.getRecordingPermissionsAsync(),
  );
  if (permission === 'blocked') {
    return 'permission-blocked';
  }
  if (permission !== 'granted') {
    return 'permission-denied';
  }
  const profiles = await dependencies.repositories.voiceProfiles.list();
  if (!profiles.some((profile) => profile.status === 'ready')) {
    return 'voice-profile-missing';
  }
  if ((await dependencies.files.availableBytes()) < MIN_FREE_STORAGE_BYTES) {
    return 'low-storage';
  }
  return null;
}
