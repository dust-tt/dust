import type { Meta, StoryObj } from "@storybook/react";

import { Spinner } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Spinner",
  component: Spinner,
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicSpinner: Story = {
  args: {
    size: "md",
  },
};
