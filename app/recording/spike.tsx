import { RecordingSpikeScreen } from '../../src/features/recording/spike/RecordingSpikeScreen';

export default function RecordingSpikeRoute() {
  if (!__DEV__) {
    return null;
  }

  return <RecordingSpikeScreen />;
}
