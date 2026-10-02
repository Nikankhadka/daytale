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

  it('drops the options under the field and collapses once one is chosen', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Select
        onChange={onChange}
        options={[
          { value: 'en', label: 'English' },
          { value: 'ne', label: 'Nepali' },
        ]}
        value="en"
      />,
    );

    expect(screen.queryByText('Nepali')).toBeNull();

    await fireEvent.press(screen.getByText('English'));
    await waitFor(() => expect(screen.getByTestId('select-menu')).toBeTruthy());
    expect(screen.getByText('Nepali')).toBeTruthy();

    await fireEvent.press(screen.getByText('Nepali'));
    expect(onChange).toHaveBeenCalledWith('ne');
    await waitFor(() => expect(screen.queryByTestId('select-menu')).toBeNull());
  });
});
