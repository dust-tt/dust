import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { useArgs } from "storybook/preview-api";

import { SliderSteps, SliderToggle } from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/SliderSteps",
  component: SliderSteps,
  parameters: {
    docs: {
      description: {
        component: `A stepped slider for choosing one of a few ordered levels, from the same family as **SliderToggle** (same track, fill and knob). Dots mark the available positions, hovering past the knob previews the fill up to the step it would snap to, and **lockedSteps** are rendered with a padlock and skipped when snapping.

**When to use**
- For a setting with a small ordered scale that applies immediately (e.g. reasoning effort levels).

**Guidelines**
- Use **value** (a 0-based step index) as the source of truth and update it from **onChange**.
- Render your own labels beneath the slider; the component only draws the track.
- For a binary setting, prefer **SliderToggle**.`,
      },
    },
  },
} satisfies Meta<typeof SliderSteps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SliderStepsBasic: Story = {
  args: {
    stepCount: 4,
    value: 1,
    ariaLabel: "Level",
    // Placeholder to satisfy the required prop; the render below wires
    // changes into the `value` arg instead.
    onChange: () => {},
  },
  // The component is fully controlled; wire changes back into the `value`
  // arg so the story is interactive and stays in sync with the controls panel.
  render: function Render(args) {
    const [{ value }, updateArgs] = useArgs<{ value: number }>();
    return (
      <div className="w-64">
        <SliderSteps
          {...args}
          value={value}
          onChange={(next) => updateArgs({ value: next })}
        />
      </div>
    );
  },
};

const InteractiveSliderSteps = ({
  stepCount = 4,
  value: initialValue = 0,
  lockedSteps,
  disabled,
}: {
  stepCount?: number;
  value?: number;
  lockedSteps?: number[];
  disabled?: boolean;
}) => {
  const [value, setValue] = React.useState(initialValue);
  return (
    <SliderSteps
      stepCount={stepCount}
      value={value}
      lockedSteps={lockedSteps}
      disabled={disabled}
      onChange={setValue}
      ariaLabel="Level"
    />
  );
};

export const SliderStepsExample = () => (
  <div className="flex w-64 flex-col gap-4">
    <InteractiveSliderSteps value={1} />
    <InteractiveSliderSteps stepCount={3} value={2} />
    <InteractiveSliderSteps value={1} lockedSteps={[2, 3]} />
    <InteractiveSliderSteps value={1} disabled />
    <div className="flex items-center gap-2">
      <SliderToggle selected />
      <span className="text-xs text-muted-foreground">
        {"<- Slider Toggle (binary) for comparison"}
      </span>
    </div>
  </div>
);
