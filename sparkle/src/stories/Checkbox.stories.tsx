import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { expect } from "storybook/test";

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
  title: "Forms & Inputs/Checkbox",
  component: Checkbox as React.ComponentType<ExtendedCheckboxProps>,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `Lets users turn an individual option on or off, or pick several options from a list. The checkbox supports **checked**, **unchecked**, and an indeterminate (**partial**) state, with optional inline **text** and **description**.

**When to use**
- For independent on/off options, or to select multiple items from a set.
- For a "select all" control whose children are partially selected (use the **partial** state).

**Guidelines**
- For a single choice among mutually exclusive options, use **RadioGroup** instead.
- For a setting that takes effect immediately, consider **SliderToggle**.
- Reserve the **partial** state for a parent that controls a partially-selected group.
- Always associate a label (via **text** or a **Label** with \`htmlFor\`) for clarity and accessibility.`,
      },
    },
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

export const Checked: Story = {
  args: { checked: true },
  tags: ["ai-generated", "needs-work"],
};

export const Indeterminate: Story = {
  args: { checked: "partial" },
  tags: ["ai-generated", "needs-work"],
};

export const Disabled: Story = {
  args: { checked: true, disabled: true },
  tags: ["ai-generated", "needs-work"],
};

// Interaction: an uncontrolled checkbox must flip its aria-checked state on click.
export const Interactive: Story = {
  tags: ["ai-generated", "needs-work"],
  play: async ({ canvas, userEvent }) => {
    const checkbox = canvas.getByRole("checkbox");
    await expect(checkbox).toHaveAttribute("aria-checked", "false");
    await userEvent.click(checkbox);
    await expect(checkbox).toHaveAttribute("aria-checked", "true");
  },
};
