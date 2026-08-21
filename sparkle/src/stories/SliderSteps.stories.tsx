import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

import { SliderSteps } from "../index_with_tw_base";

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

// SliderSteps is fully controlled; this shared render wires changes back into
// the `value` arg (on top of the `onChange` spy) so every story is interactive
// and stays in sync with the Controls panel.
function ControlledSliderSteps(args: React.ComponentProps<typeof SliderSteps>) {
  const [{ value }, updateArgs] = useArgs<{ value: number }>();
  return (
    <div className="w-64">
      <SliderSteps
        {...args}
        value={value}
        onChange={(next) => {
          args.onChange(next);
          updateArgs({ value: next });
        }}
      />
    </div>
  );
}

/**
 * A 4-step slider with the knob on step 1 — drag or click to snap between
 * levels. For a binary on/off setting, prefer **SliderToggle** instead.
 * @summary Interactive 4-step slider.
 */
export const Default: Story = {
  args: {
    stepCount: 4,
    value: 1,
    ariaLabel: "Level",
    onChange: fn(),
  },
  render: ControlledSliderSteps,
};

/**
 * Steps listed in `lockedSteps` render a padlock and are skipped when the
 * knob snaps — e.g. levels gated behind a higher plan.
 * @summary Slider with locked (gated) steps.
 */
export const WithLockedSteps: Story = {
  args: {
    stepCount: 4,
    value: 1,
    lockedSteps: [2, 3],
    ariaLabel: "Level",
    onChange: fn(),
  },
  render: ControlledSliderSteps,
};

/**
 * The disabled state: the track dims and the slider ignores pointer and
 * keyboard input entirely.
 * @summary Disabled slider.
 */
export const Disabled: Story = {
  args: {
    stepCount: 4,
    value: 1,
    disabled: true,
    ariaLabel: "Level",
    onChange: fn(),
  },
  render: ControlledSliderSteps,
};
