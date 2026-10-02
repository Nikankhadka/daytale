import { bootstrapStorage, getBootstrappedStorage } from '../../storage/bootstrap';
import type { StorageBootstrapResult } from '../../storage/bootstrap';
import type { EntityRepository } from '../../storage/repositories';
import { type AppPreferences, validateAppPreferences } from '../../storage/types';
import { useSessionStore } from '../../state/session';
import { syncDailyPrompt } from '../recording/notifications';

export const APP_PREFERENCES_ID = '00000000-0000-4000-8000-000000000004';

export type PreferencesRepository = Pick<EntityRepository<AppPreferences>, 'getById' | 'save'>;

export type PreferencesPersistenceDependencies = {
  repository?: PreferencesRepository;
  bootstrap?: () => Promise<StorageBootstrapResult>;
  now?: () => string;
  timezone?: string;
};

export function getDefaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function createDefaultAppPreferences(
  now = new Date().toISOString(),
  timezone = getDefaultTimezone(),
): AppPreferences {
  return validateAppPreferences({
    id: APP_PREFERENCES_ID,
    spokenLanguages: ['en'],
    journalLanguage: 'en',
    scheduleStartLocal: '07:00',
    scheduleEndLocal: '21:00',
    timezone,
    notificationsEnabled: false,
    microphonePermissionState: 'undetermined',
    onboardingComplete: false,
    onboardingStage: 'welcome',
    theme: 'light',
    reducedMotion: false,
    createdAt: now,
    updatedAt: now,
  });
}

export type AppPreferencesPatch = Partial<
  Pick<
    AppPreferences,
    | 'firstName'
    | 'spokenLanguages'
    | 'journalLanguage'
    | 'scheduleStartLocal'
    | 'scheduleEndLocal'
    | 'timezone'
    | 'notificationsEnabled'
    | 'microphonePermissionState'
    | 'onboardingComplete'
    | 'onboardingStage'
    | 'theme'
    | 'reducedMotion'
  >
>;

export function mergeAppPreferences(
  current: AppPreferences | null,
  patch: AppPreferencesPatch,
  now = new Date().toISOString(),
  timezone = getDefaultTimezone(),
): AppPreferences {
  const base = current ?? createDefaultAppPreferences(now, timezone);
  return validateAppPreferences({ ...base, ...patch, id: APP_PREFERENCES_ID, updatedAt: now });
}

export async function persistAppPreferences(
  patch: AppPreferencesPatch,
  dependencies: PreferencesPersistenceDependencies = {},
): Promise<AppPreferences> {
  let storage = getBootstrappedStorage();
  let repository = dependencies.repository ?? storage?.repositories?.appPreferences;
  if (!repository && dependencies.repository === undefined) {
    storage = await (dependencies.bootstrap ?? bootstrapStorage)();
    repository = storage.repositories?.appPreferences;
  }

  const current = repository
    ? await repository.getById(APP_PREFERENCES_ID)
    : useSessionStore.getState().appPreferences;
  const next = mergeAppPreferences(
    current ?? useSessionStore.getState().appPreferences,
    patch,
    dependencies.now?.() ?? new Date().toISOString(),
    dependencies.timezone ?? getDefaultTimezone(),
  );
  const saved = repository ? await repository.save(next) : next;
  useSessionStore.getState().setAppPreferences(saved);
  // Onboarding finishing and a schedule change both land here, so one call keeps the daily
  // reminder in step with what was saved. It never throws: a reminder must not fail a save.
  await syncDailyPrompt(saved);
  return saved;
}
