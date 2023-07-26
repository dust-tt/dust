import type { Meta, StoryObj } from "@storybook/react";
import { Logo } from "sparkle";

import "sparkle/dist/cjs/index.css";

const meta = {
  title: "Assets/Logo",
  component: Logo,
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicLogo: Story = {
  args: {},
};
