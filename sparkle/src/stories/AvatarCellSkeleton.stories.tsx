import { AvatarCellSkeleton } from "@sparkle/components/AvatarCellSkeleton";
import { TextCellSkeleton } from "@sparkle/components/TextCellSkeleton";
import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";

const meta = {
  title: "Feedback & Status/AvatarCellSkeleton",
  component: AvatarCellSkeleton,
  args: { children: <TextCellSkeleton className="w-32" /> },
  argTypes: { children: { control: false } },
  render: (args) => (
    <div className="flex h-12 w-64 items-center">
      <AvatarCellSkeleton {...args} />
    </div>
  ),
} satisfies Meta<typeof AvatarCellSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary A circular avatar with a single name line. */
export const Default: Story = {};

/**
 * Supply both lines explicitly to match a member name and email.
 * @summary Avatar with a name and description.
 */
export const WithDescription: Story = {
  args: {
    className: "h-9",
    children: (
      <>
        <TextCellSkeleton className="w-28" />
        <TextCellSkeleton className="w-40" />
      </>
    ),
  },
};

/** @summary Custom avatar dimensions and rounding for an entity column. */
export const SquareAvatar: Story = {
  args: { avatarClassName: "h-8 w-8 rounded-lg" },
};
