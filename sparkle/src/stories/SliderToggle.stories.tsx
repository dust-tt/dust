import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

import { Lock01, SliderToggle } from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/SliderToggle",
  component: SliderToggle,
  parameters: {
    docs: {
      description: {
        component: `A compact on/off switch for toggling a single setting that takes effect immediately. Reflects state via **selected** and can be **disabled**.

**When to use**
- For binary settings that apply instantly without a separate save action (e.g. enabling a feature in a settings row).

**Guidelines**
- Use **selected** as the source of truth and update it from the toggle handler.
- For an option that is part of a form submitted later, or that needs an inline label and description, prefer **Checkbox**.
- Pair with **SettingsList.Row** to align toggles with their title and description.
- Pass **icon** to show a small icon inside the knob, e.g. a lock icon to signal the setting is restricted.
- Pass **faded** with **selected** to mute the active track color, e.g. for a setting that is on but restricted.`,
      },
    },
  },
} satisfies Meta<typeof SliderToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

// The component is fully controlled; wire clicks back into the `selected`
// arg so the story is interactive and stays in sync with the controls panel.
function ControlledRender(args: React.ComponentProps<typeof SliderToggle>) {
  const [{ selected }, updateArgs] = useArgs<{ selected: boolean }>();
  return (
    <SliderToggle
      {...args}
      selected={selected}
      onClick={() => updateArgs({ selected: !selected })}
    />
  );
}

/**
 * The standard controlled toggle: `selected` is the source of truth and the
 * `onClick` handler flips it. Click the toggle to switch it on and off.
 * @summary Controlled on/off toggle.
 */
export const Default: Story = {
  args: {
    selected: false,
  },
  render: ControlledRender,
};

/**
 * A disabled toggle ignores clicks and mutes the track and knob. Use it when
 * the setting cannot be changed in the current context.
 * @summary Non-interactive disabled state.
 */
export const Disabled: Story = {
  args: {
    selected: false,
    disabled: true,
    onClick: fn(),
  },
};

/**
 * Pass `icon` to render a small icon inside the knob — e.g. a lock to signal
 * the setting is managed elsewhere or requires elevated permissions.
 * @summary Icon inside the toggle knob.
 */
export const WithIcon: Story = {
  args: {
    selected: false,
    icon: Lock01,
  },
  render: ControlledRender,
};

/**
 * Combine `faded` with `selected` to mute the active track color, signalling
 * a setting that is on but restricted or externally enforced.
 * @summary Muted active track for restricted settings.
 */
export const Faded: Story = {
  args: {
    selected: true,
    faded: true,
    icon: Lock01,
    onClick: fn(),
  },
};
