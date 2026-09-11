import { ChipCellSkeleton } from "@sparkle/components/ChipCellSkeleton";
import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";

const meta = {
  title: "Feedback & Status/ChipCellSkeleton",
  component: ChipCellSkeleton,
  render: (args) => (
    <div className="flex h-12 w-64 items-center">
      <ChipCellSkeleton {...args} />
    </div>
  ),
} satisfies Meta<typeof ChipCellSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A status placeholder matching an xs Chip. */
export const Default: Story = {};

/** @summary Override dimensions and rounding to match a larger sm Chip. */
export const LargeChip: Story = {
  args: { className: "h-8 w-24 rounded-xl" },
};
