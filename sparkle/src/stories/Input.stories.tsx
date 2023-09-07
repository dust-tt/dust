import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Input } from "../index_with_tw_base";

const meta = {
  title: "Atoms/Input",
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InputExample = () => (
  <div>
    <Input
      type="text"
      placeholder="Enter your name"
      className="border border-gray-300 rounded-md p-2"
    />
  </div>
);

export const InputDefault: Story = {
  args: {
    type: "text",
    placeholder: "Enter your name",
  },
};
