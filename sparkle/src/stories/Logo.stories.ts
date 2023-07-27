import type { Meta, StoryObj } from "@storybook/react";
import { Logo } from "../index_with_tw_base";

const meta = {
  title: "Assets/Logo",
  component: Logo,
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicLogo: Story = {
  args: {},
};
