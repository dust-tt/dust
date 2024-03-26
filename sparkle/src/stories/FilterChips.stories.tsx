import type { Meta } from "@storybook/react";
import React from "react";

import { FilterChips } from "../index_with_tw_base";

const meta = {
  title: "Primitives/FilterChips",
  component: FilterChips,
} satisfies Meta<typeof FilterChips>;

export default meta;

const a = ["Featured", "Writing", "Productivity", "Research", "Knowledge"];

export const TemplateItemExample = () => (
  <FilterChips
    filters={a}
    onFilterClick={(filterName) => {
      alert(`Filter ${filterName} clicked!`);
    }}
    defaultFilter="Featured"
  />
);
