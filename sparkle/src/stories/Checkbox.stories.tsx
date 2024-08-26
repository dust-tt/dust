import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Checkbox } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Checkbox",
  component: Checkbox,
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;
export const CheckBoxExample = () => {
  // No-op function for onChange
  const handleChange = () => {
    // This function intentionally left blank
  };

  return (
    <div className="s-flex s-flex-col s-gap-10">
      SM
      <div className="s-flex s-gap-10">
        Selectable
        <Checkbox variant="selectable" onChange={handleChange} />
        <Checkbox
          checked="checked"
          variant="selectable"
          onChange={handleChange}
        />
        <Checkbox
          checked="partial"
          variant="selectable"
          onChange={handleChange}
        />
        Checkable
        <Checkbox variant="checkable" onChange={handleChange} />
        <Checkbox
          checked="checked"
          variant="checkable"
          onChange={handleChange}
        />
        <Checkbox
          checked="partial"
          variant="checkable"
          onChange={handleChange}
        />
      </div>
      XS
      <div className="s-flex s-gap-10">
        Selectable
        <Checkbox size="xs" variant="selectable" onChange={handleChange} />
        <Checkbox
          size="xs"
          checked="checked"
          variant="selectable"
          onChange={handleChange}
        />
        <Checkbox
          size="xs"
          checked="partial"
          variant="selectable"
          onChange={handleChange}
        />
        Checkable
        <Checkbox size="xs" variant="checkable" onChange={handleChange} />
        <Checkbox
          size="xs"
          checked="checked"
          variant="checkable"
          onChange={handleChange}
        />
        <Checkbox
          size="xs"
          checked="partial"
          variant="checkable"
          onChange={handleChange}
        />
      </div>
    </div>
  );
};

export const Selectable: Story = {
  args: {
    checked: "checked",
    variant: "selectable",
  },
};

export const Checked: Story = {
  args: {
    checked: "checked",
    variant: "checkable",
  },
};

export const Unchecked: Story = {
  args: {
    checked: "unchecked",
  },
};

export const PartialChecked: Story = {
  args: {
    checked: "partial",
    variant: "checkable",
  },
};

export const Disabled: Story = {
  args: {
    checked: "checked",
    disabled: true,
  },
};
