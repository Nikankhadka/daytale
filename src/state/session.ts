import { create } from 'zustand';

import { type RecordingSession, validateRecordingSession } from '../storage/types';

export type SessionState = {
  activeTab: 'today' | 'journal' | 'settings';
  onboardingComplete: boolean;
  recordingSession: RecordingSession | null;
  setActiveTab: (tab: SessionState['activeTab']) => void;
  completeOnboarding: () => void;
  setRecordingSession: (session: RecordingSession | null) => void;
  resetSession: () => void;
};

export const INITIAL_SESSION_STATE = {
  activeTab: 'today' as const,
  onboardingComplete: false,
  recordingSession: null,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...INITIAL_SESSION_STATE,
  setActiveTab: (activeTab) => set({ activeTab }),
  completeOnboarding: () => set({ onboardingComplete: true }),
  setRecordingSession: (session) =>
    set({ recordingSession: session === null ? null : validateRecordingSession(session) }),
  resetSession: () => set(INITIAL_SESSION_STATE),
}));
