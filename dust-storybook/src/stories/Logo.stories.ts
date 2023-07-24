import type { Meta, StoryObj } from "@storybook/react";
import { Logo } from "@dust-tt/sparkle";

const meta = {
  title: "Example/Logo",
  component: Logo,
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicLogo: Story = {
  args: {},
};
