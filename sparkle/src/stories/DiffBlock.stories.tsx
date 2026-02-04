import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, DiffBlock, EyeIcon } from "../index_with_tw_base";

const meta = {
  title: "Conversation/DiffBlock",
  component: DiffBlock,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="s-w-full s-max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DiffBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const diffExample = [
  {
    old: "const total = items.length;",
    new: "const total = items.filter(Boolean).length;",
  },
  {
    old: "return total / items.length;",
    new: "return total / Math.max(items.length, 1);",
  },
];

const longDiffExample = [
  {
    old: [
      "function buildReport(rows) {",
      "  const total = rows.length;",
      "  const headers = rows[0] || {};",
      "  const columns = Object.keys(headers);",
      "  return columns.map((key) => rows.map((row) => row[key]));",
      "}",
    ].join("\n"),
    new: [
      "function buildReport(rows) {",
      "  const total = rows.filter(Boolean).length;",
      "  const headers = rows[0] || {};",
      "  const columns = Object.keys(headers);",
      "  const normalized = rows.map((row) => row ?? {});",
      "  return columns.map((key) => normalized.map((row) => row[key]));",
      "}",
    ].join("\n"),
  },
  {
    old: "return total / rows.length;",
    new: "return total / Math.max(rows.length, 1);",
  },
];

export const Default: Story = {
  args: {
    changes: diffExample,
    actions: (
      <Button
        variant="outline"
        size="xs"
        icon={EyeIcon}
        tooltip="View changes"
        onClick={() => {}}
      />
    ),
  },
};

export const CollapsedPreview: Story = {
  args: {
    changes: longDiffExample,
  },
};
