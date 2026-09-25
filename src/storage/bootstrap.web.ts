import { useSessionStore } from '../state/session';

export type StorageBootstrapResult = {
  database: null;
  repositories: null;
};

let bootstrapPromise: Promise<StorageBootstrapResult> | undefined;

export function bootstrapStorage(): Promise<StorageBootstrapResult> {
  if (bootstrapPromise === undefined) {
    bootstrapPromise = Promise.resolve({ database: null, repositories: null });
  }
  return bootstrapPromise;
}

export function invalidateStorageBootstrap(): void {
  bootstrapPromise = undefined;
  useSessionStore.getState().resetSession();
}
