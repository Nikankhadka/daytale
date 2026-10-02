import { create } from 'zustand';

import { getBootstrappedStorage } from '../storage/bootstrap';
import type { JournalEntry } from '../storage/types';

export type JournalLoadState = 'idle' | 'loading' | 'ready' | 'error';

export type JournalDraft = { title: string; paragraphs: string[] };

export type JournalState = {
  entries: JournalEntry[];
  loadState: JournalLoadState;
  activeEntryId: string | null;
  draft: JournalDraft | null;
  error: string | null;
  loadEntries: () => Promise<void>;
  openEntry: (id: string) => void;
  updateEntry: (id: string, patch: JournalDraft) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  setDraft: (draft: JournalDraft | null) => void;
  reset: () => void;
};

const INITIAL_JOURNAL_STATE = {
  entries: [] as JournalEntry[],
  loadState: 'idle' as JournalLoadState,
  activeEntryId: null as string | null,
  draft: null as JournalDraft | null,
  error: null as string | null,
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
    set({ loadState: 'loading', error: null });
    try {
      const entries = await storage.repositories.journalEntries.list();
      set({ entries: [...entries].sort(byNewest), loadState: 'ready' });
    } catch {
      set({ loadState: 'error', error: 'Your journals could not be loaded.' });
    }
  },
  openEntry: (id) => set({ activeEntryId: id, draft: null }),
  updateEntry: async (id, patch) => {
    const current = get().entries.find((entry) => entry.id === id);
    if (!current) {
      return;
    }
    const now = new Date().toISOString();
    const next: JournalEntry = { ...current, ...patch, editedAt: now, updatedAt: now };
    const storage = getBootstrappedStorage();
    try {
      const saved = storage ? await storage.repositories.journalEntries.save(next) : next;
      set({
        entries: get().entries.map((entry) => (entry.id === id ? saved : entry)),
        draft: null,
      });
    } catch {
      set({ error: 'Your edits could not be saved.' });
    }
  },
  removeEntry: async (id) => {
    const storage = getBootstrappedStorage();
    try {
      if (storage) {
        await storage.repositories.journalEntries.deleteById(id);
      }
      set({
        entries: get().entries.filter((entry) => entry.id !== id),
        activeEntryId: get().activeEntryId === id ? null : get().activeEntryId,
      });
    } catch {
      set({ error: 'That journal could not be deleted.' });
    }
  },
  setDraft: (draft) => set({ draft }),
  reset: () => set(INITIAL_JOURNAL_STATE),
}));
