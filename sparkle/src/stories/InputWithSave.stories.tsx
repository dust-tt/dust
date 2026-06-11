import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";

import { InputWithSave } from "../index_with_tw_base";

const meta = {
  title: "Forms & Inputs/InputWithSave",
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
}: {
  initialValue: string;
  unit?: string;
  placeholder?: string;
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
      }}
    />
  );
}

export const ExampleInputWithSave: Story = {
  args: {
    value: "12,890",
    unit: "Credits",
    onSave: () => {},
  },
  render: (args) => (
    <ControlledInputWithSave
      initialValue={args.value ?? ""}
      unit={args.unit}
      placeholder={args.placeholder}
    />
  ),
};

export function InputWithSaveExamples() {
  return (
    <div className="s-flex s-max-w-md s-flex-col s-gap-4">
      <ControlledInputWithSave initialValue="12,890" unit="Credits" />
      <ControlledInputWithSave initialValue="49" unit="$" />
      <ControlledInputWithSave
        initialValue=""
        unit="Credits"
        placeholder="Enter an amount"
      />
      <ControlledInputWithSave initialValue="No unit here" />
    </div>
  );
}
