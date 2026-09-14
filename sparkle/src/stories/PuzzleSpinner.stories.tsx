import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, PuzzleSpinner } from "../index_with_tw_base";

const meta = {
  title: "Feedback & Status/PuzzleSpinner",
  component: PuzzleSpinner,
  tags: ["!manifest", "autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "**Easter egg — do not use.** A puzzle-shaped loading indicator made exclusively for the skill-import animation. For a standard async button use the Button's `isLoading` prop; for generic loading states use **Spinner**.",
      },
    },
  },
} satisfies Meta<typeof PuzzleSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The puzzle spinner used as a button's icon while an action resolves. For a
 * standard async button, prefer the Button's own `isLoading` prop (it swaps in
 * a **Spinner** and blocks double submits); use **PuzzleSpinner** when you want
 * the playful puzzle treatment, and plain **Spinner** for generic loading
 * elsewhere.
 * @summary Puzzle spinner inside a loading button.
 */
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
