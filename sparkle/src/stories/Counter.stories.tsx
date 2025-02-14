import type { Meta } from "@storybook/react";

import { Counter } from "../components/Counter";

const meta = {
  title: "Primitives/Counter",
  component: Counter,
  args: {
    value: 4,
    size: "sm",
    variant: "primary",
    isInButton: false,
  },
  argTypes: {
    value: {
      control: { type: "number" },
    },
    size: {
      control: { type: "select" },
      options: ["xs", "sm", "md"],
    },
    variant: {
      control: { type: "select" },
      options: ["primary", "highlight", "warning", "outline", "ghost"],
    },
    isInButton: {
      control: "boolean",
      description: "Whether the counter is displayed inside a button",
    },
  },
} satisfies Meta<typeof Counter>;

export default meta;

export const Default = {
  args: {
    value: 4,
    variant: "primary",
    isInButton: false,
  },
};
