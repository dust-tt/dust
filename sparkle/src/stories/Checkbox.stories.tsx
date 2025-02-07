import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { CHECKBOX_SIZES } from "@sparkle/components/Checkbox";

import { Checkbox } from "../index_with_tw_base";

const CHECKED_STATES = {
  Unchecked: false,
  Checked: true,
  Partial: "partial",
} as const;

type CheckedState = boolean | "indeterminate";
const meta = {
  title: "Primitives/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
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
    label: {
      description: "Text label to display next to the checkbox",
      control: "text",
    },
    tooltip: {
      description: "Optional tooltip shown on hover",
      control: "text",
    },
    labelProps: {
      description: "Props for the label component",
      control: "object",
    },
  },
} as Meta<typeof Checkbox>;

export default meta;
export const Default: StoryObj<typeof Checkbox> = {
  args: {
    label: "Click me or my label",
    size: "sm",
  },
  render: (args) => {
    const [checked, setChecked] = React.useState(args.checked ?? false);

    React.useEffect(() => {
      setChecked(args.checked ?? false);
    }, [args.checked]);

    return (
      <Checkbox
        {...args}
        checked={checked}
        onCheckedChange={(state: CheckedState) => setChecked(state === true)}
      />
    );
  },
};
