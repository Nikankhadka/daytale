import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { Chip } from '../../src/shared/ui/primitives';
import { Select } from '../../src/shared/ui/Select';

describe('shared control fixes', () => {
  it('marks a busy chip disabled but keeps its button role', async () => {
    const onPress = jest.fn();
    const screen = await render(<Chip disabled label="Work" onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Work' });
    expect(button.props.accessibilityState).toEqual({ disabled: true });

    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps the select open when its own sheet is tapped, closing only on the scrim', async () => {
    const screen = await render(
      <Select
        onChange={jest.fn()}
        options={[
          { value: 'en', label: 'English' },
          { value: 'ne', label: 'Nepali' },
        ]}
        value="en"
      />,
    );

    await fireEvent.press(screen.getByText('English'));
    await waitFor(() => expect(screen.getByText('Nepali')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('select-sheet'));
    expect(screen.getByText('Nepali')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('select-scrim'));
    await waitFor(() => expect(screen.queryByText('Nepali')).toBeNull());
  });
});
