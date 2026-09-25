import { create } from 'zustand';

import {
  type AppPreferences,
  type RecordingSession,
  validateAppPreferences,
  validateRecordingSession,
} from '../storage/types';

export type SessionState = {
  activeTab: 'today' | 'journal' | 'settings';
  onboardingComplete: boolean;
  appPreferences: AppPreferences | null;
  recordingSession: RecordingSession | null;
  setActiveTab: (tab: SessionState['activeTab']) => void;
  completeOnboarding: () => void;
  setAppPreferences: (preferences: AppPreferences | null) => void;
  setRecordingSession: (session: RecordingSession | null) => void;
  resetSession: () => void;
};

export const INITIAL_SESSION_STATE = {
  activeTab: 'today' as const,
  onboardingComplete: false,
  appPreferences: null,
  recordingSession: null,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...INITIAL_SESSION_STATE,
  setActiveTab: (activeTab) => set({ activeTab }),
  completeOnboarding: () => set({ onboardingComplete: true }),
  setAppPreferences: (preferences) => {
    const validated = preferences === null ? null : validateAppPreferences(preferences);
    set({ appPreferences: validated, onboardingComplete: validated?.onboardingComplete ?? false });
  },
  setRecordingSession: (session) =>
    set({ recordingSession: session === null ? null : validateRecordingSession(session) }),
  resetSession: () => set(INITIAL_SESSION_STATE),
}));
