import type { JournalEntry } from '../../storage/types';

/** Journal dates are local calendar dates (`YYYY-MM-DD`); read them in UTC to avoid a shift. */
function asUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function weekdayShort(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(
    asUtc(date),
  );
}

export function dayNumber(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric' }).format(asUtc(date));
}

export function monthName(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long' }).format(asUtc(date));
}

export function year(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric' }).format(asUtc(date));
}

/** "Mon, 15 Apr 2026". */
export function formatEntryEyebrow(date: string): string {
  return `${weekdayShort(date)}, ${dayNumber(date)} ${new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
  }).format(asUtc(date))} ${year(date)}`;
}

/** "April 2026". */
export function monthLabel(date: string): string {
  return `${monthName(date)} ${year(date)}`;
}

export type MonthGroup = { key: string; label: string; entries: JournalEntry[] };

/** Groups newest-first entries into month buckets, preserving order. */
export function groupByMonth(entries: JournalEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const entry of entries) {
    const key = entry.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({ key, label: monthLabel(entry.date), entries: [entry] });
    }
  }
  return groups;
}
