import { create } from 'zustand';

export type SessionState = {
  activeTab: 'today' | 'journal' | 'settings';
  onboardingComplete: boolean;
  setActiveTab: (tab: SessionState['activeTab']) => void;
  completeOnboarding: () => void;
  resetSession: () => void;
};

export const INITIAL_SESSION_STATE = {
  activeTab: 'today' as const,
  onboardingComplete: false,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...INITIAL_SESSION_STATE,
  setActiveTab: (activeTab) => set({ activeTab }),
  completeOnboarding: () => set({ onboardingComplete: true }),
  resetSession: () => set(INITIAL_SESSION_STATE),
}));
