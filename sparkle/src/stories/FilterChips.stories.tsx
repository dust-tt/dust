import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { FilterChips } from "../index_with_tw_base";

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
- For a standalone status or metadata label that is not interactive, use **Chip** instead.`,
      },
    },
  },
  args: {
    onFilterClick: fn(),
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
