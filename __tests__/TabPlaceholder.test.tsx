import { render } from '@testing-library/react-native';

import { TabPlaceholder } from '../src/shared/ui/TabPlaceholder';

describe('TabPlaceholder', () => {
  it('renders the shell identity and foundation note', async () => {
    const screen = await render(
      <TabPlaceholder
        title="Today"
        description="A quiet place for the day."
        accessibilityLabel="Today foundation screen"
      />,
    );

    expect(screen.getByText('Daytale')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Foundation shell')).toBeTruthy();
  });
});
