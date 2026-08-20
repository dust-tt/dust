import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { DataTableLoadingSkeleton } from "@sparkle/components";

const meta = {
  title: "Feedback & Status/DataTableLoadingSkeleton",
  component: DataTableLoadingSkeleton,
  parameters: {
    docs: {
      description: {
        component: `A skeleton placeholder that mirrors the layout of a **DataTable** / **ScrollableDataTable** (header and rows with an optional selection checkbox, a label, and an optional trailing cell). Built on **LoadingBlock**, it reserves the table's shape while rows are being fetched, so the swap to real content feels seamless.

**When to use**
- While loading rows whose shape is known ahead of time (selectable lists, tables).

**Guidelines**
- Toggle \`showSelectionColumn\` and \`showTrailingCell\` to match the real table's columns.
- For an indeterminate load with no known layout, use a **Spinner** instead.`,
      },
    },
  },
  argTypes: {
    rows: { control: { type: "number" } },
    showSelectionColumn: { control: "boolean" },
    showTrailingCell: { control: "boolean" },
  },
} satisfies Meta<typeof DataTableLoadingSkeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Demo: Story = {
  args: {
    rows: 5,
    showSelectionColumn: true,
    showTrailingCell: false,
  },
};

export const PlainList: Story = {
  args: {
    rows: 6,
    showSelectionColumn: false,
    showTrailingCell: false,
  },
};
