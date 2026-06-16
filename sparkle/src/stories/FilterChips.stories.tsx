import type { Meta } from "@storybook/react";
import React from "react";

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
} satisfies Meta<typeof FilterChips>;

export default meta;

export const FilterChipsExample = () => (
  <FilterChips
    filters={["Featured", "Writing", "Productivity", "Research", "Knowledge"]}
    onFilterClick={(filterName) => {
      alert(`Filter ${filterName} clicked!`);
    }}
    defaultFilter="Featured"
  />
);
