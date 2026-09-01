import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { useArgs } from "storybook/preview-api";
import { expect, fireEvent, fn, waitFor, within } from "storybook/test";

import { SliderSteps } from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/SliderSteps",
  component: SliderSteps,
  parameters: {
    docs: {
      description: {
        component: `A stepped slider for choosing one of a few ordered levels, from the same family as **SliderToggle** (same track, fill and knob). Dots mark the available positions, hovering past the knob previews the fill up to the step it would snap to, and unselectable steps are skipped when snapping. Use **lockedSteps** for access-gated steps and **unavailableSteps** for unsupported steps.

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

const THIRD_STEP_TOOLTIP = "This step requires a higher plan.";
const FOURTH_STEP_TOOLTIP = "This step requires the highest plan.";

async function expectStepTooltips(canvasElement: HTMLElement) {
  const slider = within(canvasElement).getByRole("slider");
  const root = slider.parentElement?.parentElement;
  if (!root) {
    throw new Error("Slider root not found.");
  }

  const rootRect = root.getBoundingClientRect();
  fireEvent.pointerMove(root, {
    clientX: rootRect.left + (rootRect.width * 2) / 3,
    clientY: rootRect.top + rootRect.height / 2,
  });

  const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
    "tooltip"
  );
  await waitFor(() => expect(tooltip).toBeVisible());
  expect(tooltip).toHaveTextContent(THIRD_STEP_TOOLTIP);
  // The slider itself remains the trigger while the hovered step changes.
  expect(root).toHaveAttribute("aria-describedby");

  fireEvent.pointerMove(root, {
    clientX: rootRect.right - 1,
    clientY: rootRect.top + rootRect.height / 2,
  });

  await waitFor(() => expect(tooltip).toHaveTextContent(FOURTH_STEP_TOOLTIP));
}

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
 * Locked steps render a padlock; unavailable steps render a slash. Both are
 * skipped when the knob snaps.
 * @summary Slider with unselectable steps.
 */
export const WithUnselectableSteps: Story = {
  args: {
    stepCount: 4,
    value: 1,
    lockedSteps: [2],
    unavailableSteps: [3],
    stepTooltips: [null, null, THIRD_STEP_TOOLTIP, FOURTH_STEP_TOOLTIP],
    ariaLabel: "Level",
    onChange: fn(),
  },
  render: ControlledSliderSteps,
  play: async ({ canvasElement }) => {
    await expectStepTooltips(canvasElement);
  },
};

/**
 * The disabled state: the track dims and the slider ignores pointer and
 * keyboard input while still explaining locked steps on hover.
 * @summary Disabled slider.
 */
export const Disabled: Story = {
  args: {
    stepCount: 4,
    value: 1,
    disabled: true,
    lockedSteps: [2, 3],
    stepTooltips: [null, null, THIRD_STEP_TOOLTIP, FOURTH_STEP_TOOLTIP],
    ariaLabel: "Level",
    onChange: fn(),
  },
  render: ControlledSliderSteps,
  play: async ({ canvasElement }) => {
    await expectStepTooltips(canvasElement);
  },
};
