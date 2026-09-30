import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Linking } from 'react-native';

import { TAB_ROUTE_PATHS, VOICE_SETUP_ROUTE_PATH } from '../../navigation/routes';
import { useSessionStore } from '../../state/session';
import { getBootstrappedStorage } from '../../storage/bootstrap';
import { expoPermissionGateway } from '../permissions';
import { BREAK_LABELS, endBreak, startBreak, useBreakChoice } from '../recording/breaks';
import type { CommandFailure, CommandResult } from '../recording/engine';
import { discardFailedSession, retrySession, skipSession } from '../recording/sessionCommands';
import { recordingHost, useIsCapturing } from '../recording/useRecordingEngine';
import { PrivacySheet } from './PrivacySheet';
import {
  canPreview,
  describeDeadline,
  formatClock,
  formatElapsed,
  formatEyebrowDate,
  interruptionReason,
  scheduleWindowLabel,
  todayKind,
} from './todayView';
import {
  BlockerNotice,
  FailedView,
  IdleView,
  PausedView,
  ProcessingView,
  PromptView,
  RecordingView,
  type Blocker,
} from './views';

const PROBLEM = 'That did not work. Please try again.';

const BLOCKERS: readonly CommandFailure[] = [
  'permission-denied',
  'permission-blocked',
  'voice-profile-missing',
  'low-storage',
];

/** Re-reads the clock every second while a timer is on screen, every half minute otherwise. */
function useNow(fast: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), fast ? 1_000 : 30_000);
    return () => clearInterval(interval);
  }, [fast]);
  return now;
}

/** A different session starts from a clean slate: no stale blocker, preview, or open sheet. */
export function TodayScreen() {
  const sessionId = useSessionStore((state) => state.recordingSession?.id);
  return <TodayContent key={sessionId ?? 'none'} />;
}

function TodayContent() {
  const router = useRouter();
  const session = useSessionStore((state) => state.recordingSession);
  const preferences = useSessionStore((state) => state.appPreferences);
  const capturing = useIsCapturing();
  const breakChoice = useBreakChoice();
  const [previewing, setPreviewing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [blocker, setBlocker] = React.useState<Blocker | null>(null);
  const [problem, setProblem] = React.useState<string | undefined>();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const retryOperation = React.useRef<string | undefined>(undefined);
  const now = useNow(session?.status === 'recording');

  const kind = todayKind({ session, now, previewing, capturing, busy });

  const status = session?.status;
  // A privacy break only exists while the session is paused.
  React.useEffect(() => {
    if (status !== 'paused') {
      endBreak();
    }
  }, [status]);

  const timezone = preferences?.timezone ?? session?.timezone ?? 'UTC';

  const report = (result: CommandResult) => {
    if (result.ok) {
      return;
    }
    if (BLOCKERS.includes(result.code)) {
      setBlocker(result.code as Blocker);
    } else {
      setProblem(PROBLEM);
    }
  };

  const command = async (task: () => Promise<CommandResult>) => {
    setBusy(true);
    setBlocker(null);
    setProblem(undefined);
    try {
      report(await task());
    } catch {
      setProblem(PROBLEM);
    } finally {
      setBusy(false);
    }
  };

  const start = () => session && command(() => recordingHost.engine.start(session.id));
  const resume = () => command(() => recordingHost.engine.resume());
  const stop = () => command(() => recordingHost.engine.stop());
  const retryBlocked = async () => {
    if (blocker === 'permission-denied') {
      await expoPermissionGateway.requestRecordingPermissionsAsync().catch(() => undefined);
    }
    await (session?.status === 'scheduled' ? start() : resume());
  };

  const takeBreak = async (choice: keyof typeof BREAK_LABELS) => {
    setSheetOpen(false);
    await command(async () => {
      const result = await recordingHost.engine.pause();
      if (result.ok) {
        startBreak(choice, () => void recordingHost.engine.resume());
      }
      return result;
    });
  };

  const withStorage = async (
    task: (storage: NonNullable<ReturnType<typeof getBootstrappedStorage>>) => Promise<void>,
  ) => {
    const storage = getBootstrappedStorage();
    if (storage === undefined) {
      setProblem('Secure storage is unavailable.');
      return;
    }
    setBusy(true);
    setProblem(undefined);
    try {
      await task(storage);
    } catch {
      setProblem(PROBLEM);
    } finally {
      setBusy(false);
      void recordingHost.reconcile(new Date());
    }
  };

  const skip = () =>
    session &&
    withStorage(async (storage) => {
      if (!(await skipSession(storage, session.id))) {
        setProblem(PROBLEM);
      }
    });

  const retry = () =>
    session &&
    withStorage(async (storage) => {
      // One id per press: a repeated tap after a thrown error cannot apply the retry twice.
      retryOperation.current ??= randomUUID();
      const outcome = await retrySession(storage, session.id, retryOperation.current);
      retryOperation.current = undefined;
      if (outcome === 'rejected') {
        setProblem('That could not be retried right now.');
      }
    });

  const discard = () =>
    session &&
    withStorage(async (storage) => {
      if (!(await discardFailedSession(storage, session.id))) {
        setProblem(PROBLEM);
      }
    });

  const notice = blocker ? (
    <BlockerNotice
      blocker={blocker}
      busy={busy}
      onOpenSettings={() => void Linking.openSettings()}
      onRetry={() => void retryBlocked()}
      onSetUpVoice={() => router.push(VOICE_SETUP_ROUTE_PATH)}
    />
  ) : null;

  const eyebrow = formatEyebrowDate(now, timezone);

  if (session === null || kind === 'idle') {
    const startLocal = preferences?.scheduleStartLocal;
    return (
      <IdleView
        eyebrow={eyebrow}
        restingUntil={startLocal ? formatClock(startLocal) : 'your next window'}
        windowLabel={scheduleWindowLabel(preferences)}
        onPreview={canPreview(session, now) ? () => setPreviewing(true) : undefined}
      />
    );
  }
  switch (kind) {
    case 'prompt':
      return (
        <PromptView
          eyebrow={eyebrow}
          name={preferences?.firstName}
          busy={busy}
          problem={problem}
          notice={notice}
          onStart={() => void start()}
          onChangeTime={() => router.navigate(TAB_ROUTE_PATHS.settings)}
          onSkip={() => void skip()}
        />
      );
    case 'recording':
      return (
        <>
          <RecordingView
            elapsed={formatElapsed(session, now, true)}
            problem={problem}
            onPause={() => setSheetOpen(true)}
            onStop={() => void stop()}
          />
          <PrivacySheet
            visible={sheetOpen}
            onChoose={(choice) => void takeBreak(choice)}
            onStopForToday={() => {
              setSheetOpen(false);
              void stop();
            }}
            onCancel={() => setSheetOpen(false)}
          />
        </>
      );
    case 'paused': {
      const reason = interruptionReason(session);
      return (
        <PausedView
          breakLabel={BREAK_LABELS[breakChoice ?? 'manual']}
          reason={reason}
          elapsed={formatElapsed(session, now, false)}
          busy={busy}
          problem={problem}
          notice={notice}
          onResume={() => void resume()}
          onStop={() => void stop()}
        />
      );
    }
    case 'failed':
      return (
        <FailedView
          deadline={
            session.retryUntil ? describeDeadline(session.retryUntil, now, timezone) : undefined
          }
          busy={busy}
          problem={problem}
          onRetry={() => void retry()}
          onDiscard={() => void discard()}
        />
      );
    default:
      return <ProcessingView />;
  }
}

export const TodayPlaceholder = TodayScreen;
