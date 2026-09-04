import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { expect, fn, waitFor } from "storybook/test";

import {
  FILTER_CHIP_VARIANTS,
  FilterChip,
  FilterChips,
  Folder,
  ListSelect,
} from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/FilterChips",
  component: FilterChips,
  parameters: {
    docs: {
      description: {
        component: `A horizontal row of single-select filter chips for narrowing a list or collection to one category at a time. Takes a list of **filters**, fires **onFilterClick** on selection, and can preselect one via **defaultFilter**.

**When to use**
- To let users switch between mutually exclusive views or categories (e.g. \`"Featured"\`, \`"Research"\`).

**Guidelines**
- Selection is single-choice: only one chip is active at a time, so use it for filtering rather than multi-tagging.
- Pass a **defaultFilter** that matches an entry in **filters** to highlight the initial category.
- **variant** picks the selected look: \`primary\` fills the chip, \`secondary\` uses the lighter selected background for quieter surfaces such as a title bar.
- For a single chip whose selection you control yourself (a panel toggle, an icon-only chip), use **FilterChip** directly.
- For a standalone status or metadata label that is not interactive, use **Chip** instead.`,
      },
    },
  },
  args: {
    onFilterClick: fn(),
  },
  argTypes: {
    variant: {
      options: FILTER_CHIP_VARIANTS,
      control: { type: "radio" },
    },
  },
} satisfies Meta<typeof FilterChips>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A category filter row with an initial selection: **defaultFilter** highlights
 * one chip on mount, and clicking another chip moves the selection and fires
 * **onFilterClick** with the chip's name. Selection state is managed internally
 * (uncontrolled) — the component exposes no prop to drive it from outside.
 * @summary Single-select filter row with a preselected chip.
 */
export const Default: Story = {
  args: {
    filters: ["Featured", "Writing", "Productivity", "Research", "Knowledge"],
    defaultFilter: "Featured",
  },
};

/**
 * Without **defaultFilter**, no chip is highlighted until the user picks one —
 * appropriate when the list starts unfiltered and every chip narrows it.
 * @summary Filter row with no initial selection.
 */
export const NoDefaultSelection: Story = {
  args: {
    filters: ["Featured", "Writing", "Productivity", "Research", "Knowledge"],
  },
};

/**
 * The lighter selected look: the active chip gets the `selected` background
 * instead of a filled pill, for quieter surfaces such as a title bar.
 * @summary Secondary selected style.
 */
export const Secondary: Story = {
  args: {
    filters: ["Featured", "Writing", "Productivity", "Research", "Knowledge"],
    defaultFilter: "Featured",
    variant: "secondary",
  },
};

/**
 * Standalone **FilterChip** with caller-controlled selection: icon plus label,
 * one selected in `secondary` style, and an icon-only chip with its label as a
 * tooltip.
 * @summary Controlled single chips with icons.
 */
export const SingleChips: Story = {
  // Renders FilterChip on its own, so keep it out of the FilterChips manifest.
  tags: ["!manifest"],
  args: { filters: [] },
  render: () => (
    <div className="flex items-center gap-2">
      <FilterChip
        label="Files"
        icon={Folder}
        variant="secondary"
        onClick={fn()}
      />
      <FilterChip
        label="Plan 2/7"
        icon={ListSelect}
        variant="secondary"
        isSelected
        onClick={fn()}
      />
      <FilterChip
        icon={Folder}
        tooltip="Files"
        variant="secondary"
        onClick={fn()}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      const pressed = Array.from(canvasElement.querySelectorAll("button")).map(
        (chip) => chip.getAttribute("aria-pressed")
      );
      expect(pressed).toEqual(["false", "true", "false"]);
    });
  },
};
