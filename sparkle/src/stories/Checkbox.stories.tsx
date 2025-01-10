import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { CHECKBOX_SIZES } from "@sparkle/components/Checkbox";

import {
  Checkbox,
  type CheckboxProps,
  CheckboxWithText,
  CheckBoxWithTextAndDescription,
} from "../index_with_tw_base";

const CHECKED_STATES = {
  unchecked: false,
  checked: true,
  partial: "partial",
} as const;

type ExtendedCheckboxProps = CheckboxProps & {
  text?: string;
  description?: string;
};

const meta = {
  title: "Primitives/Checkbox",
  // We need to cast here as the component expects stricter props
  component: Checkbox as React.ComponentType<ExtendedCheckboxProps>,
  parameters: {
    layout: "centered",
  },
  argTypes: {
    size: {
      description: "The size of the checkbox",
      options: CHECKBOX_SIZES,
      control: { type: "select" },
      table: {
        defaultValue: { summary: "sm" },
      },
    },
    checked: {
      description: "The checked state of the checkbox",
      options: Object.keys(CHECKED_STATES),
      mapping: CHECKED_STATES,
      control: { type: "select" },
      table: {
        type: { summary: "boolean | 'partial'" },
        defaultValue: { summary: "false" },
      },
    },
    disabled: {
      description: "Whether the checkbox is disabled",
      control: "boolean",
      table: {
        defaultValue: { summary: false },
      },
    },
    className: {
      description: "Additional CSS classes to apply",
      control: "text",
    },
    text: {
      description: "Optional text label to display next to the checkbox",
      control: "text",
    },
    description: {
      description:
        "Optional description text (only shown when text is provided)",
      control: "text",
      if: { arg: "text" },
    },
    onChange: {
      description: "Callback when checkbox state changes",
      action: "changed",
    },
  },
} satisfies Meta<ExtendedCheckboxProps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    size: "sm",
    checked: false,
    disabled: false,
  },
  render: ({ text, description, ...args }) => {
    if (text && description) {
      return (
        <CheckBoxWithTextAndDescription
          text={text}
          description={description}
          {...args}
        />
      );
    }
    if (text) {
      return <CheckboxWithText text={text} {...args} />;
    }
    return <Checkbox {...args} />;
  },
};
