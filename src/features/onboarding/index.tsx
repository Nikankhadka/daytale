import { TabPlaceholder } from '../../shared/ui/TabPlaceholder';

export function OnboardingPlaceholder() {
  return (
    <TabPlaceholder
      title="Welcome to Daytale"
      description="The first-run setup will guide name, language, schedule, permissions, and voice enrollment."
      accessibilityLabel="Onboarding foundation screen"
    />
  );
}
