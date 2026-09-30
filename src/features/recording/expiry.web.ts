import type { cleanupExpiredSession as NativeCleanupExpiredSession } from '../../storage/cleanup';

export const cleanupExpiredSession: typeof NativeCleanupExpiredSession = async () => {
  throw new Error('Secure data deletion is unavailable on web.');
};
