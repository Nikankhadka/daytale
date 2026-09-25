import { initializeDatabase, type DatabaseDependencies, type SQLiteDatabaseLike } from './database';
import { createStorageRepositories, type StorageRepositories } from './repositories';
import { useSessionStore } from '../state/session';
import type { AppPreferences, RecordingSession } from './types';

export type StorageBootstrapResult = {
  database: SQLiteDatabaseLike;
  repositories: StorageRepositories;
};

let bootstrapPromise: Promise<StorageBootstrapResult> | undefined;
let bootstrapGeneration = 0;
let activeStorage: StorageBootstrapResult | undefined;

export function bootstrapStorage(
  dependencies: DatabaseDependencies = {},
): Promise<StorageBootstrapResult> {
  if (bootstrapPromise !== undefined) {
    return bootstrapPromise;
  }

  const generation = bootstrapGeneration;
  const inflight = initializeStorage(dependencies, generation);
  let tracked!: Promise<StorageBootstrapResult>;
  tracked = inflight.catch((error: unknown) => {
    if (bootstrapPromise === tracked) {
      bootstrapPromise = undefined;
    }
    throw error;
  });
  bootstrapPromise = tracked;
  return bootstrapPromise;
}

export function invalidateStorageBootstrap(): void {
  bootstrapGeneration += 1;
  bootstrapPromise = undefined;
  activeStorage = undefined;
  useSessionStore.getState().resetSession();
}

export function getBootstrappedStorage(): StorageBootstrapResult | undefined {
  return activeStorage;
}

async function initializeStorage(
  dependencies: DatabaseDependencies,
  generation: number,
): Promise<StorageBootstrapResult> {
  let database: SQLiteDatabaseLike | undefined;
  try {
    database = await initializeDatabase(dependencies);
    if (generation !== bootstrapGeneration) {
      throw new StorageBootstrapError();
    }
    const repositories = createStorageRepositories(database);
    const sessions = await repositories.recordingSessions.list();
    const latest = findLatestSession(sessions);
    const preferences = await repositories.appPreferences.list();
    const latestPreferences = findLatestPreferences(preferences);
    if (generation !== bootstrapGeneration) {
      throw new StorageBootstrapError();
    }
    useSessionStore.getState().setAppPreferences(latestPreferences);
    useSessionStore.getState().setRecordingSession(latest);
    const result = { database, repositories };
    activeStorage = result;
    return result;
  } catch {
    activeStorage = undefined;
    await database?.closeAsync().catch(() => undefined);
    throw new StorageBootstrapError();
  }
}

export class StorageBootstrapError extends Error {
  public constructor() {
    super('Secure storage bootstrap failed.');
    this.name = 'StorageBootstrapError';
  }
}

function findLatestSession(sessions: RecordingSession[]): RecordingSession | null {
  return sessions.reduce<RecordingSession | null>((latest, session) => {
    if (latest === null || Date.parse(session.updatedAt) > Date.parse(latest.updatedAt)) {
      return session;
    }
    return latest;
  }, null);
}

function findLatestPreferences(preferences: AppPreferences[]): AppPreferences | null {
  if (preferences.length > 1) {
    throw new StorageBootstrapError();
  }
  return preferences.reduce<AppPreferences | null>((latest, preferences) => {
    if (latest === null || Date.parse(preferences.updatedAt) > Date.parse(latest.updatedAt)) {
      return preferences;
    }
    return latest;
  }, null);
}
