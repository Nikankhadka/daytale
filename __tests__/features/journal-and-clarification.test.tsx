import { fireEvent, render } from '@testing-library/react-native';

import { groupByMonth } from '../../src/features/journal/format';
import { ClarificationView } from '../../src/features/today/ClarificationView';
import {
  PROCESSING_STAGES,
  ProcessingView,
  processingStageIndex,
} from '../../src/features/today/views';
import type { JournalEntry } from '../../src/storage/types';

function entry(overrides: Partial<JournalEntry>): JournalEntry {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    date: '2026-04-15',
    timezone: 'UTC',
    title: 'A productive day',
    paragraphs: ['First paragraph.'],
    contextTags: ['Work'],
    sourceEventIds: [],
    language: 'en',
    createdAt: '2026-04-15T10:00:00.000Z',
    updatedAt: '2026-04-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('journal formatting', () => {
  it('groups newest-first entries into month buckets in order', () => {
    const groups = groupByMonth([
      entry({ id: 'a', date: '2026-04-15' }),
      entry({ id: 'b', date: '2026-04-14' }),
      entry({ id: 'c', date: '2026-03-10' }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(['2026-04', '2026-03']);
    expect(groups[0].entries.map((item) => item.id)).toEqual(['a', 'b']);
    expect(groups[1].label).toBe('March 2026');
  });
});

describe('clarification view', () => {
  it('renders the neutral time card and answers with a chip', async () => {
    const onAnswer = jest.fn();
    const screen = await render(
      <ClarificationView
        index={0}
        onAnswer={onAnswer}
        question="What were you doing here?"
        timeLabel="8:16 AM – 4:55 PM"
        total={2}
      />,
    );

    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
    expect(screen.getByText('8:16 AM – 4:55 PM')).toBeTruthy();
    expect(screen.queryByText('Bondi Junction')).toBeNull();

    await fireEvent.press(screen.getByText('Work'));
    expect(onAnswer).toHaveBeenCalledWith('Work');
  });

  it('treats Ignore as a skip', async () => {
    const onAnswer = jest.fn();
    const screen = await render(
      <ClarificationView
        index={1}
        onAnswer={onAnswer}
        question="And here?"
        timeLabel="6:10 PM – 7:40 PM"
        total={2}
      />,
    );

    await fireEvent.press(screen.getByText('Ignore'));
    expect(onAnswer).toHaveBeenCalledWith(null);
  });
});

describe('processing view', () => {
  it('maps status to a stage index and caps at the stage count', () => {
    expect(processingStageIndex('transcribing')).toBe(0);
    expect(processingStageIndex('analyzing')).toBe(1);
    expect(processingStageIndex('generating')).toBe(2);
    expect(processingStageIndex('ready')).toBe(3);
    expect(processingStageIndex(undefined)).toBe(0);
  });

  it('renders the three prototype stage labels with no action buttons', async () => {
    const screen = await render(<ProcessingView stageIndex={1} />);

    for (const stage of PROCESSING_STAGES) {
      expect(screen.getByText(stage)).toBeTruthy();
    }
    expect(screen.queryByRole('button')).toBeNull();
  });
});
