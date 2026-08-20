import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { expect } from "storybook/test";

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
  tags: ["a11y-issues"],
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

// Shared story render: keeps the checkbox controlled so the Controls panel
// stays in sync, and swaps to the CheckboxWithText /
// CheckBoxWithTextAndDescription wrappers when `text` / `description` are set.
const renderCheckbox: Story["render"] = function Render({
  text,
  description,
  ...args
}) {
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
};

/**
 * The canonical unchecked checkbox. Set **text** (and **description**) from
 * the Controls panel to switch to the labeled wrapper variants.
 * @summary Interactive checkbox with optional text and description.
 */
export const Default: Story = {
  args: {
    checked: false,
    disabled: false,
  },
  render: renderCheckbox,
};

/**
 * The on state, for an option the user has selected.
 * @summary Checked state.
 */
export const Checked: Story = {
  args: { checked: true },
  tags: ["ai-generated", "needs-work"],
  render: renderCheckbox,
};

/**
 * The partial state, for a "select all" parent whose children are only
 * partially selected. Clicking resolves it to a boolean state.
 * @summary Indeterminate (partial) state.
 */
export const Indeterminate: Story = {
  args: { checked: "partial" },
  tags: ["ai-generated", "needs-work"],
  render: renderCheckbox,
};

/**
 * A disabled checkbox keeps its checked value visible but ignores
 * interaction — use it for options the current context does not allow
 * changing.
 * @summary Disabled checked state.
 */
export const Disabled: Story = {
  args: { checked: true, disabled: true },
  tags: ["ai-generated", "needs-work"],
  render: renderCheckbox,
};

/**
 * Interaction test: an uncontrolled checkbox must flip its aria-checked
 * state on click. The value of this story is its play assertions.
 * @summary Interaction test for click toggling.
 */
export const Interactive: Story = {
  tags: ["ai-generated", "needs-work", "!manifest"],
  play: async ({ canvas, userEvent }) => {
    const checkbox = canvas.getByRole("checkbox");
    const indicator = checkbox.querySelector('[data-state="unchecked"]');

    await expect(checkbox).toHaveAttribute("aria-checked", "false");
    await expect(indicator).not.toBeNull();

    await userEvent.click(checkbox);

    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    await expect(checkbox.querySelector('[data-state="checked"]')).toBe(
      indicator
    );
  },
};
