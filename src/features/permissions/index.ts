import type { PermissionResponse } from 'expo';

import type { MicrophonePermissionState } from '../../storage/types';

export type PermissionGateway = {
  getRecordingPermissionsAsync: () => Promise<PermissionResponse>;
  requestRecordingPermissionsAsync: () => Promise<PermissionResponse>;
  getNotificationPermissionsAsync: () => Promise<PermissionResponse>;
  requestNotificationPermissionsAsync: () => Promise<PermissionResponse>;
};

export const expoPermissionGateway: PermissionGateway = {
  getRecordingPermissionsAsync: async () => {
    const { getRecordingPermissionsAsync } = await import('expo-audio');
    return getRecordingPermissionsAsync();
  },
  requestRecordingPermissionsAsync: async () => {
    const { requestRecordingPermissionsAsync } = await import('expo-audio');
    return requestRecordingPermissionsAsync();
  },
  getNotificationPermissionsAsync: async () => {
    const { getPermissionsAsync } = await import('expo-notifications');
    return getPermissionsAsync();
  },
  requestNotificationPermissionsAsync: async () => {
    const { requestPermissionsAsync } = await import('expo-notifications');
    return requestPermissionsAsync();
  },
};

export function microphonePermissionState(response: PermissionResponse): MicrophonePermissionState {
  if (response.granted) {
    return 'granted';
  }
  if (response.canAskAgain === false) {
    return 'blocked';
  }
  if (response.status === 'denied') {
    return 'denied';
  }
  return 'undetermined';
}
