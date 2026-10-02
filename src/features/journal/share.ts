import { Share } from 'react-native';

import type { JournalEntry } from '../../storage/types';

/** Native share sheet with only the written entry; never the recording it came from. */
export async function shareEntry(entry: JournalEntry): Promise<void> {
  await Share.share({
    title: entry.title,
    message: `${entry.title}\n\n${entry.paragraphs.join('\n\n')}`,
  });
}
