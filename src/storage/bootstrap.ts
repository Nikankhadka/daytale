import { initializeDatabase, type DatabaseDependencies, type SQLiteDatabaseLike } from './database';
import { createStorageRepositories, type StorageRepositories } from './repositories';
import { useSessionStore } from '../state/session';
import type { RecordingSession } from './types';

export type StorageBootstrapResult = {
  database: SQLiteDatabaseLike;
  repositories: StorageRepositories;
};

let bootstrapPromise: Promise<StorageBootstrapResult> | undefined;
let bootstrapGeneration = 0;

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
  useSessionStore.getState().resetSession();
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
    if (generation !== bootstrapGeneration) {
      throw new StorageBootstrapError();
    }
    useSessionStore.getState().setRecordingSession(latest);
    return { database, repositories };
  } catch {
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
