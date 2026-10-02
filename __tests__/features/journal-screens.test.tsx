import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { JournalDetailScreen } from '../../src/features/journal/JournalDetailScreen';
import { JournalEditScreen } from '../../src/features/journal/JournalEditScreen';
import { useJournalStore } from '../../src/state/journal';
import type { JournalEntry } from '../../src/storage/types';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockGetBootstrappedStorage = jest.fn();
const mockParams: { id: string } = { id: 'journal-1' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../src/storage/bootstrap', () => ({
  getBootstrappedStorage: () => mockGetBootstrappedStorage(),
}));

const entry: JournalEntry = {
  id: 'journal-1',
  sessionId: 'session-1',
  date: '2026-03-10',
  timezone: 'UTC',
  title: 'A quiet morning',
  paragraphs: ['I walked by the river.'],
  contextTags: ['Walk'],
  sourceEventIds: [],
  language: 'en',
  createdAt: '2026-03-10T09:00:00.000Z',
  updatedAt: '2026-03-10T09:00:00.000Z',
};

function storageWith(journalEntries: Record<string, jest.Mock>) {
  return { database: {}, repositories: { journalEntries } };
}

describe('journal write surfaces', () => {
  beforeEach(() => {
    useJournalStore.getState().reset();
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('keeps the edit screen open and reports a failed save', async () => {
    useJournalStore.setState({ entries: [entry] });
    mockGetBootstrappedStorage.mockReturnValue(
      storageWith({
        list: jest.fn(async () => [entry]),
        save: jest.fn(async () => {
          throw new Error('disk full');
        }),
        deleteById: jest.fn(),
      } as never),
    );

    const screen = await render(<JournalEditScreen />);
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() =>
      expect(screen.getByText('Your edits could not be saved. Please try again.')).toBeTruthy(),
    );
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('returns to the list after a successful save', async () => {
    useJournalStore.setState({ entries: [entry] });
    mockGetBootstrappedStorage.mockReturnValue(
      storageWith({
        list: jest.fn(async () => [entry]),
        save: jest.fn(async (next: JournalEntry) => next),
        deleteById: jest.fn(),
      } as never),
    );

    const screen = await render(<JournalEditScreen />);
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('keeps the detail screen open and reports a failed delete', async () => {
    useJournalStore.setState({ entries: [entry] });
    mockGetBootstrappedStorage.mockReturnValue(
      storageWith({
        list: jest.fn(async () => [entry]),
        save: jest.fn(),
        deleteById: jest.fn(async () => {
          throw new Error('disk full');
        }),
      } as never),
    );

    const screen = await render(<JournalDetailScreen />);
    await fireEvent.press(screen.getByLabelText('Delete entry'));
    await fireEvent.press(screen.getByText('Delete'));

    await waitFor(() =>
      expect(screen.getByText('That journal could not be deleted.')).toBeTruthy(),
    );
    expect(mockBack).not.toHaveBeenCalled();
  });
});
