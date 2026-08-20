import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { fn } from "storybook/test";

import { InputWithSave } from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/InputWithSave",
  tags: ["a11y-issues"],
  component: InputWithSave,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: `A text field with an optional right-aligned **unit** and an inline save action. At rest it shows the value and unit; while editing, a Save button appears on the right. Clicking save (or pressing Enter) calls **onSave** and shows a spinner until the returned promise resolves; blurring without saving (or pressing Escape) reverts the edit.

**When to use**
- For a single value that is persisted on its own (e.g. a quota, a price, a limit), without a surrounding form.

**Guidelines**
- **onSave** receives the draft string and may return a promise; the spinner is shown until it settles.
- The component reverts to the **value** prop when the edit is abandoned, so keep **value** in sync with the persisted state.`,
      },
    },
  },
  argTypes: {
    value: {
      description: "The persisted value shown at rest",
      control: "text",
    },
    unit: {
      description: "Optional unit displayed on the right of the input",
      control: "text",
    },
    placeholder: {
      description: "Placeholder text for the input",
      control: "text",
    },
    disabled: {
      description: "Whether the input is disabled",
      control: "boolean",
    },
    onSave: {
      description: "Callback when the save button is clicked",
      action: "saved",
    },
  },
} satisfies Meta<React.ComponentProps<typeof InputWithSave>>;

export default meta;
type Story = StoryObj<typeof meta>;

function ControlledInputWithSave({
  initialValue,
  unit,
  placeholder,
  onSave,
}: {
  initialValue: string;
  unit?: string;
  placeholder?: string;
  onSave?: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <InputWithSave
      value={value}
      unit={unit}
      placeholder={placeholder}
      onSave={async (newValue) => {
        // Simulate a network call.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setValue(newValue);
        await onSave?.(newValue);
      }}
    />
  );
}

/**
 * A persisted value with a unit. The story wires `onSave` to a simulated
 * 1s network call so the save spinner is visible; keep `value` in sync with
 * the persisted state in real usage.
 *
 * @summary Saved value with a right-aligned unit.
 */
export const Default: Story = {
  args: {
    value: "12,890",
    onSave: fn(),
    unit: "Credits",
  },
  render: (args) => (
    <ControlledInputWithSave
      initialValue={args.value ?? ""}
      unit={args.unit}
      placeholder={args.placeholder}
      onSave={args.onSave}
    />
  ),
};

/**
 * Empty state: no persisted value yet, so the `placeholder` invites input.
 *
 * @summary Empty field with a placeholder.
 */
export const EmptyWithPlaceholder: Story = {
  args: {
    value: "",
    onSave: fn(),
    unit: "Credits",
    placeholder: "Enter an amount",
  },
  render: (args) => (
    <ControlledInputWithSave
      initialValue={args.value ?? ""}
      unit={args.unit}
      placeholder={args.placeholder}
      onSave={args.onSave}
    />
  ),
};

/**
 * Without a `unit`, the field is a plain inline-save text input.
 *
 * @summary Inline-save field with no unit.
 */
export const WithoutUnit: Story = {
  args: {
    value: "Marketing team workspace",
    onSave: fn(),
  },
  render: (args) => (
    <ControlledInputWithSave
      initialValue={args.value ?? ""}
      unit={args.unit}
      placeholder={args.placeholder}
      onSave={args.onSave}
    />
  ),
};
