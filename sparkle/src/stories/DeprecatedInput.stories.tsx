import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { DeprecatedInput } from "../index_with_tw_base";

const MESSAGE_STATUSES = ["info", "default", "error"] as const;

const meta = {
  title: "Forms & Inputs/DeprecatedInput",
  component: DeprecatedInput,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: `**Deprecated.** This is the previous input design, kept only for incremental migration. Use \`Input\` for anything new. \`DeprecatedInput\` will be removed once all consumers have migrated.

A single-line text field with an optional **label** and a helper or error **message**.`,
      },
    },
  },
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
} satisfies Meta<typeof DeprecatedInput>;

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
