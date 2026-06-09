import type { Meta, StoryObj } from "@storybook/react";
import type { PaginationState } from "@tanstack/react-table";
import React, { useState } from "react";
import { expect } from "storybook/test";

import { Pagination } from "@sparkle/components/Pagination";

// Pagination is controlled. Each story wraps it so the `pagination` state lives locally and is
// fed back in — mirroring real callers and making the interaction play meaningful. The defaults
// below seed the initial state; `render` replaces `setPagination` with the local state setter.
const meta: Meta<typeof Pagination> = {
  title: "Navigation/Pagination",
  component: Pagination,
  args: {
    rowCount: 95,
    pagination: { pageIndex: 0, pageSize: 10 },
    setPagination: () => {},
  },
  render: (args) => {
    const [pagination, setPagination] = useState(args.pagination);
    return (
      <Pagination
        {...args}
        pagination={pagination}
        setPagination={setPagination}
      />
    );
  },
  tags: ["ai-generated", "needs-work"],
  parameters: {
    docs: {
      description: {
        component: `A controlled pager for tabular or list data. It derives the page count from **rowCount** and the current **pagination** state (\`pageIndex\`/\`pageSize\`), and reports changes through **setPagination** — the caller owns the state. Shows a "showing X-Y of N" range summary, with **showPageButtons** toggling the numbered buttons, **disablePaginationNumbers** hiding them entirely, and **rowCountIsCapped** flagging an approximate total.

**When to use**
- To page through a large dataset rendered in chunks (e.g. a table backed by \`@tanstack/react-table\`).

**Guidelines**
- This component is controlled: store \`pagination\` in the parent and update it from \`setPagination\`.
- Pass an accurate \`rowCount\`; set \`rowCountIsCapped\` when the total is a lower-bound estimate.`,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SinglePage: Story = {
  args: { rowCount: 4 },
};

// Interaction: selecting page 2 must advance the controlled state and update the range summary.
export const NavigatesPages: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText(/showing 1-10 of 95/i)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "2" }));
    await expect(canvas.getByText(/showing 11-20 of 95/i)).toBeVisible();
  },
};

// Single project-wide CssCheck. Pagination's page-number buttons use `s-font-medium`, which
// Tailwind compiles to `font-weight: 500`. A concrete computed value is the only proof that the
// shared preview actually loaded Sparkle's stylesheet — `toBeVisible` would pass even unstyled.
export const CssCheck: Story = {
  play: async ({ canvas }) => {
    const pageButton = canvas.getByRole("button", { name: "1" });
    await expect(getComputedStyle(pageButton).fontWeight).toBe("500");
  },
};
