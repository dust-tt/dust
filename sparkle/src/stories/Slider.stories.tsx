import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { SLIDER_VARIANTS } from "@sparkle/components/Slider";

import { Slider } from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/Slider",
  component: Slider,
  parameters: {
    docs: {
      description: {
        component: `A continuous slider for picking a number, or a range with several thumbs, between **min** and **max**, snapping to **step**. Built on Radix Slider, so it supports keyboard navigation (arrows, Home/End, Page Up/Down), RTL, and native form submission via **name**.

**When to use**
- To pick a numeric value on a continuous scale where dragging is faster than typing (volume, opacity, a budget cap).
- To pick a lower and upper bound at once: pass two values to get a range slider.

**Guidelines**
- Give every thumb an accessible name with **ariaLabel**, or one per thumb with **thumbAriaLabels** on a range slider.
- Use **defaultValue** for uncontrolled usage; pass **value** with **onValueChange** to control it. Use **onValueCommit** to react only when the user releases the thumb.
- Control the width via **className** (e.g. \`w-64\`); the slider fills its container by default.
- **variant** colors the filled part of the track: **primary** (default) or **highlight** (blue), matching the Button variants.
- Set **showValueTooltip** to display, above the pointer, the value a click would select while hovering and the thumb's value while dragging; **formatValue** customizes the text (e.g. to add a unit).
- For a small ordered scale with labelled positions, prefer **SliderSteps**; for an on/off setting, prefer **SliderToggle**.`,
      },
    },
  },
  args: {
    ariaLabel: "Volume",
    min: 0,
    max: 100,
    step: 1,
    onValueChange: fn(),
    onValueCommit: fn(),
  },
  argTypes: {
    variant: {
      options: SLIDER_VARIANTS,
      control: { type: "select" },
    },
    orientation: {
      options: ["horizontal", "vertical"],
      control: { type: "radio" },
    },
  },
  render: (args) => (
    <div className={args.orientation === "vertical" ? "h-48" : "w-64"}>
      <Slider {...args} />
    </div>
  ),
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A single-thumb slider starting at 50. Drag the thumb or focus it and use the
 * arrow keys; **onValueChange** fires on every step.
 * @summary Single value slider.
 */
export const Default: Story = {
  args: {
    defaultValue: [50],
  },
  play: async ({ args, canvas, userEvent }) => {
    const thumb = canvas.getByRole("slider", { name: "Volume" });
    expect(thumb).toHaveAttribute("aria-valuenow", "50");

    await userEvent.click(thumb);
    await userEvent.keyboard("{ArrowRight}");

    expect(thumb).toHaveAttribute("aria-valuenow", "51");
    expect(args.onValueChange).toHaveBeenCalledWith([51]);
  },
};

/**
 * The **highlight** variant fills the track in blue, for a slider that is the
 * primary control of its view, like a highlight Button.
 * @summary Blue highlight fill.
 */
export const Highlight: Story = {
  args: {
    defaultValue: [60],
    variant: "highlight",
  },
};

/**
 * With **showValueTooltip**, a tooltip follows the pointer over the track and
 * previews the value a click would select; during a drag it shows the thumb's
 * value. It closes when the pointer leaves. **formatValue** adds the unit.
 * @summary Value tooltip following the pointer.
 */
export const WithValueTooltip: Story = {
  args: {
    defaultValue: [35],
    showValueTooltip: true,
    formatValue: (v: number) => `${v}%`,
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const thumb = canvas.getByRole("slider", { name: "Volume" });
    const root = thumb.parentElement?.parentElement;
    if (!root) {
      throw new Error("Slider root not found.");
    }
    const body = within(canvasElement.ownerDocument.body);
    const rect = root.getBoundingClientRect();
    const at = (ratio: number) => ({
      clientX: rect.left + rect.width * ratio,
      clientY: rect.top + rect.height / 2,
    });

    // Hovering previews the value under the pointer without changing the thumb.
    await userEvent.pointer({ target: root, coords: at(0.5) });
    const tooltip = await body.findByRole("tooltip");
    await waitFor(() => expect(tooltip).toHaveTextContent("50%"));
    expect(thumb).toHaveAttribute("aria-valuenow", "35");

    // Pressing there moves the thumb; the tooltip shows the thumb's value.
    await userEvent.pointer({
      keys: "[MouseLeft>]",
      target: root,
      coords: at(0.5),
    });
    expect(thumb).toHaveAttribute("aria-valuenow", "50");
    await waitFor(() => expect(tooltip).toHaveTextContent("50%"));
    await userEvent.pointer({
      keys: "[/MouseLeft]",
      target: root,
      coords: at(0.5),
    });

    await userEvent.unhover(root);
    await waitFor(() => expect(body.queryByRole("tooltip")).toBeNull());
  },
};

/**
 * Two values render two thumbs, and the filled range spans between them.
 * Name each thumb with **thumbAriaLabels**.
 * @summary Range slider with two thumbs.
 */
export const Range: Story = {
  args: {
    defaultValue: [20, 80],
    ariaLabel: undefined,
    thumbAriaLabels: ["Minimum price", "Maximum price"],
    minStepsBetweenThumbs: 1,
  },
  play: async ({ canvas }) => {
    expect(canvas.getAllByRole("slider")).toHaveLength(2);
    expect(
      canvas.getByRole("slider", { name: "Minimum price" })
    ).toHaveAttribute("aria-valuenow", "20");
    expect(
      canvas.getByRole("slider", { name: "Maximum price" })
    ).toHaveAttribute("aria-valuenow", "80");
  },
};

/**
 * A coarse **step** of 10 snaps the thumb to round values; the keyboard moves
 * by one step at a time.
 * @summary Slider snapping to a coarse step.
 */
export const CoarseStep: Story = {
  args: {
    defaultValue: [30],
    step: 10,
  },
  play: async ({ canvas, userEvent }) => {
    const thumb = canvas.getByRole("slider", { name: "Volume" });
    await userEvent.click(thumb);
    await userEvent.keyboard("{ArrowRight}");
    expect(thumb).toHaveAttribute("aria-valuenow", "40");
  },
};

// Local state rather than `useArgs`: arg updates travel through the Storybook
// channel and never re-render inside the vitest runner, so a play function
// could not observe the controlled round-trip.
function ControlledSlider(args: React.ComponentProps<typeof Slider>) {
  const [value, setValue] = React.useState(args.value ?? [0]);
  return (
    <div className="flex w-64 flex-col gap-2">
      <Slider
        {...args}
        value={value}
        onValueChange={(next) => {
          args.onValueChange?.(next);
          setValue(next);
        }}
      />
      <span className="text-sm text-muted-foreground">{`Value: ${value[0]}`}</span>
    </div>
  );
}

/**
 * Controlled usage: **value** is the source of truth and **onValueChange**
 * writes it back. The label beneath mirrors the current value.
 * @summary Controlled slider with a value readout.
 */
export const Controlled: Story = {
  args: {
    value: [25],
  },
  render: ControlledSlider,
  play: async ({ canvas, userEvent }) => {
    const thumb = canvas.getByRole("slider", { name: "Volume" });
    await userEvent.click(thumb);
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(canvas.getByText("Value: 27")).toBeInTheDocument();
  },
};

/**
 * Vertical orientation: the track grows to the container height and the
 * value increases upward.
 * @summary Vertical slider.
 */
export const Vertical: Story = {
  args: {
    defaultValue: [40],
    orientation: "vertical",
  },
};

/**
 * The disabled state dims the slider and ignores pointer and keyboard input.
 * @summary Disabled slider.
 */
export const Disabled: Story = {
  args: {
    defaultValue: [50],
    disabled: true,
  },
  play: async ({ args, canvas, userEvent }) => {
    const thumb = canvas.getByRole("slider", { name: "Volume" });
    // The thumb blocks pointer events when disabled, so drive it from the keyboard.
    thumb.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(thumb).toHaveAttribute("aria-valuenow", "50");
    expect(args.onValueChange).not.toHaveBeenCalled();
  },
};
