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
- Treat this as a reasonable default. Since cells can render arbitrary custom components, prefer a table-specific skeleton when you need the loading state to match their exact shape.
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

/**
 * Loading placeholder for a table whose rows carry a selection checkbox —
 * the shape of a selectable DataTable list mid-fetch.
 * @summary Loading rows with a selection column.
 */
export const SelectableRowsLoading: Story = {
  args: {
    rows: 5,
    showSelectionColumn: true,
    showTrailingCell: false,
  },
};

/**
 * Loading placeholder for a plain, non-selectable list: label-only rows with
 * no checkbox and no trailing cell.
 * @summary Loading rows for a plain list.
 */
export const PlainList: Story = {
  args: {
    rows: 6,
    showSelectionColumn: false,
    showTrailingCell: false,
  },
};
