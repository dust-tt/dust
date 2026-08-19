import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { useArgs } from "storybook/preview-api";

import { Button, Lock01, SliderToggle } from "../index_with_tw_base";

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
- Pass **icon** to show a small icon inside the knob, e.g. a lock icon to signal the setting is restricted.`,
      },
    },
  },
} satisfies Meta<typeof SliderToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SliderToggleBasic: Story = {
  args: {
    selected: false,
  },
  // The component is fully controlled; wire clicks back into the `selected`
  // arg so the story is interactive and stays in sync with the controls panel.
  render: function Render(args) {
    const [{ selected }, updateArgs] = useArgs<{ selected: boolean }>();
    return (
      <SliderToggle
        {...args}
        selected={selected}
        onClick={() => updateArgs({ selected: !selected })}
      />
    );
  },
};

const InteractiveSliderToggle = ({
  selected: initialSelected = false,
  disabled,
}: {
  selected?: boolean;
  disabled?: boolean;
}) => {
  const [selected, setSelected] = React.useState(initialSelected);
  return (
    <SliderToggle
      selected={selected}
      disabled={disabled}
      onClick={() => setSelected((prev) => !prev)}
    />
  );
};

export const SliderExample = () => (
  <div className="flex items-center gap-2">
    <Button variant="outline" size="sm" label="Settings" />
    <InteractiveSliderToggle />
    <InteractiveSliderToggle selected />
    <InteractiveSliderToggle disabled />
    <InteractiveSliderToggle selected disabled />
  </div>
);

export const SliderWithIcon = () => (
  <div className="flex items-center gap-2">
    <SliderToggle icon={Lock01} selected={false} disabled />
    <SliderToggle icon={Lock01} selected disabled />
  </div>
);
