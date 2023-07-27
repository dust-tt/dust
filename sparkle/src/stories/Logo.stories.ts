import type { Meta, StoryObj } from "@storybook/react";

import { Logo } from "../index_with_tw_base";

const meta = {
  title: "Assets/Logo",
  component: Logo,
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LogoFullColor: Story = {
  args: {
    shape: "full",
    type: "full-color",
    className: "w-32",
  },
};

export const LogoColoredGrey: Story = {
  args: {
    shape: "full",
    type: "colored-grey",
    className: "w-32",
  },
};

export const LogoSquareFullColor: Story = {
  args: {
    shape: "square",
    type: "full-color",
    className: "w-32",
  },
};

export const LogoSquareColoredGrey: Story = {
  args: {
    shape: "square",
    type: "colored-grey",
    className: "w-32",
  },
};
