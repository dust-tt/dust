import { TextCellSkeleton } from "@sparkle/components/TextCellSkeleton";
import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";

const meta = {
  title: "Feedback & Status/TextCellSkeleton",
  component: TextCellSkeleton,
  render: (args) => (
    <div className="flex h-12 w-64 items-center">
      <TextCellSkeleton {...args} />
    </div>
  ),
} satisfies Meta<typeof TextCellSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A single line for a name, date, or other text value. */
export const Default: Story = {};

/**
 * Match a numeric column with a shorter line aligned to its right edge.
 * @summary Right-aligned numeric value.
 */
export const RightAlignedValue: Story = {
  args: { className: "ml-auto w-16" },
};
