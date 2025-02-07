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
    tooltip: {
      description: "Optional tooltip shown on hover",
      control: "text",
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
  render: function Render({ text, description, ...args }) {
    const [checked, setChecked] = React.useState(args.checked ?? false);
    const id = React.useId();

    React.useEffect(() => {
      setChecked(args.checked ?? false);
    }, [args.checked]);

    const props = {
      ...args,
      id,
      checked,
      onCheckedChange: (state: boolean | "indeterminate") =>
        setChecked(state === true),
    };

    if (text && description) {
      return (
        <CheckBoxWithTextAndDescription
          text={text}
          description={description}
          {...props}
        />
      );
    }
    if (text) {
      return <CheckboxWithText text={text} {...props} />;
    }
    return <Checkbox {...props} />;
  },
};
