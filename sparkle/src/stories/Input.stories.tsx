import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Input } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Input",
  component: Input,
  tags: ["autodocs"],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllVariants: Story = {
  render: () => (
    <div className="s-flex s-flex-col s-gap-20">
      <div className="s-grid s-grid-cols-3 s-gap-4">
        <Input
          placeholder="placeholder"
          name="input"
          message="Name must be unique"
          messageStatus="info"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="value"
          message="errored because it's a very long message"
          messageStatus="error"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="value"
          message="Default message"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="value"
          message="errored because it's a very long message"
          messageStatus="error"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="disabled"
          disabled
          messageStatus="error"
        />
      </div>
      <div className="s-grid s-grid-cols-3 s-gap-4">
        <Input placeholder="placeholder" name="input" />
        <Input
          placeholder="placeholder"
          name="input"
          value="value"
          message="errored because it's a very long message"
          messageStatus="error"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="value"
          message="Default message"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="value"
          message="errored because it's a very long message"
          messageStatus="error"
        />
        <Input
          placeholder="placeholder"
          name="input"
          value="test"
          messageStatus="error"
        />
      </div>
      <div className="s-grid s-grid-cols-3 s-gap-4">
        <Input
          placeholder="placeholder"
          name="input"
          label="Firstname"
          isError
        />
        <Input
          placeholder="placeholder"
          name="input"
          label="Lastname"
          message="Input your lastname"
          messageStatus="info"
          isError
        />
      </div>
    </div>
  ),
};
