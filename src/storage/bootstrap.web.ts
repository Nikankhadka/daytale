import { useSessionStore } from '../state/session';

export type StorageBootstrapResult = {
  database: null;
  repositories: null;
};

let bootstrapPromise: Promise<StorageBootstrapResult> | undefined;
let activeStorage: StorageBootstrapResult | undefined;

export function bootstrapStorage(): Promise<StorageBootstrapResult> {
  if (bootstrapPromise === undefined) {
    const result = { database: null, repositories: null } as const;
    activeStorage = result;
    bootstrapPromise = Promise.resolve(result);
  }
  return bootstrapPromise;
}

export function getBootstrappedStorage(): StorageBootstrapResult | undefined {
  return activeStorage;
}

export function invalidateStorageBootstrap(): void {
  bootstrapPromise = undefined;
  activeStorage = undefined;
  useSessionStore.getState().resetSession();
}
