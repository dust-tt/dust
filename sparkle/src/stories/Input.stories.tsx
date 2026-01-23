import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Input } from "../index_with_tw_base";

const MESSAGE_STATUSES = ["info", "default", "error"] as const;

const meta = {
  title: "Primitives/Input",
  component: Input,
  tags: ["autodocs"],
  argTypes: {
    placeholder: {
      control: "text",
      description: "Placeholder text for the input",
    },
    value: {
      control: "text",
      description: "Current value of the input",
    },
    label: {
      control: "text",
      description: "Optional label above the input",
    },
    message: {
      control: "text",
      description: "Helper or error message below the input",
    },
    messageStatus: {
      options: MESSAGE_STATUSES,
      control: { type: "select" },
      description: "Status/color of the message",
    },
    disabled: {
      control: "boolean",
      description: "Whether the input is disabled",
    },
    isError: {
      control: "boolean",
      description: "Whether the input is in an error state",
    },
    type: {
      control: "select",
      options: ["text", "email", "password", "number", "tel", "url"],
      description: "HTML input type",
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    placeholder: "Enter text...",
    value: "",
    label: "Input Label",
    message: "This is a helper message",
    messageStatus: "info",
    disabled: false,
    isError: false,
    type: "text",
  },
};

export const WithError: Story = {
  args: {
    placeholder: "Enter text...",
    value: "Invalid value",
    label: "Email",
    message: "Please enter a valid email address",
    messageStatus: "error",
    isError: true,
  },
};

export const Disabled: Story = {
  args: {
    placeholder: "Disabled input",
    value: "Cannot edit",
    label: "Disabled Field",
    disabled: true,
  },
};

export const WithInfoMessage: Story = {
  args: {
    placeholder: "Enter your name",
    label: "Full Name",
    message: "Name must be unique",
    messageStatus: "info",
  },
};

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
