import { create } from 'zustand';

import { getBootstrappedStorage } from '../storage/bootstrap';
import type { JournalEntry } from '../storage/types';

export type JournalLoadState = 'idle' | 'loading' | 'ready' | 'error';

export type JournalDraft = { title: string; paragraphs: string[] };

export type JournalState = {
  entries: JournalEntry[];
  loadState: JournalLoadState;
  loadEntries: () => Promise<void>;
  updateEntry: (id: string, patch: JournalDraft) => Promise<boolean>;
  removeEntry: (id: string) => Promise<boolean>;
  reset: () => void;
};

const INITIAL_JOURNAL_STATE = {
  entries: [] as JournalEntry[],
  loadState: 'idle' as JournalLoadState,
};

/** Newest first; the date is the day the entry describes. */
function byNewest(a: JournalEntry, b: JournalEntry): number {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1;
  }
  return a.createdAt < b.createdAt ? 1 : -1;
}

export const useJournalStore = create<JournalState>((set, get) => ({
  ...INITIAL_JOURNAL_STATE,
  loadEntries: async () => {
    const storage = getBootstrappedStorage();
    if (!storage) {
      set({ entries: [], loadState: 'ready' });
      return;
    }
    set({ loadState: 'loading' });
    try {
      const entries = await storage.repositories.journalEntries.list();
      set({ entries: [...entries].sort(byNewest), loadState: 'ready' });
    } catch {
      set({ loadState: 'error' });
    }
  },
  updateEntry: async (id, patch) => {
    const current = get().entries.find((entry) => entry.id === id);
    if (!current) {
      return false;
    }
    const now = new Date().toISOString();
    const next: JournalEntry = { ...current, ...patch, editedAt: now, updatedAt: now };
    const storage = getBootstrappedStorage();
    try {
      const saved = storage ? await storage.repositories.journalEntries.save(next) : next;
      set({
        entries: get().entries.map((entry) => (entry.id === id ? saved : entry)),
      });
      return true;
    } catch {
      return false;
    }
  },
  removeEntry: async (id) => {
    const storage = getBootstrappedStorage();
    try {
      if (storage) {
        await storage.repositories.journalEntries.deleteById(id);
      }
      set({ entries: get().entries.filter((entry) => entry.id !== id) });
      return true;
    } catch {
      return false;
    }
  },
  reset: () => set(INITIAL_JOURNAL_STATE),
}));
