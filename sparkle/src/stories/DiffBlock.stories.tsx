import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, DiffBlock, Eye } from "../index_with_tw_base";

const meta = {
  title: "Product/Conversation/DiffBlock",
  component: DiffBlock,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `Renders a set of code edits as a line-by-line diff inside an agent message. Takes a \`changes\` array of \`{ old, new }\` string pairs (each may span multiple lines) and shows removals and additions; large diffs collapse to a preview, and an optional \`actions\` slot holds controls such as a "view changes" **Button**.

**When to use**
- To show edits an agent proposes or applied to code, contrasting the previous and new content.

**Guidelines**
- Group related edits into one \`changes\` array; multi-line hunks collapse automatically into a preview.
- Use the \`actions\` slot for affordances like opening the full file rather than embedding controls in the diff body.
- For plain (non-diff) code rendering, use **CodeBlock**.`,
      },
    },
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
        icon={Eye}
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
