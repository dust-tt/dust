import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, PuzzleSpinner } from "../index_with_tw_base";

const meta = {
  title: "Feedback & Status/PuzzleSpinner",
  component: PuzzleSpinner,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "A compact puzzle-shaped loading indicator for buttons and other inline loading states.",
      },
    },
  },
} satisfies Meta<typeof PuzzleSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InButton: Story = {
  render: (): React.ReactElement => (
    <Button
      className="w-20"
      icon={<PuzzleSpinner />}
      disabled
      aria-label="Loading"
    />
  ),
};
