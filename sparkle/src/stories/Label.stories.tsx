import type { Meta } from "@storybook/react";
import React from "react";

import { Checkbox, Label } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Label",
  component: Label,
} satisfies Meta<typeof Label>;

export default meta;

export const LabelDemo = () => {
  const handleChange = () => {
    // This function intentionally left blank
  };
  return (
    <div>
      <div className="s-flex s-items-center s-space-x-2">
        <Checkbox onChange={handleChange} />
        <Label htmlFor="terms">Accept terms and conditions</Label>
      </div>
    </div>
  );
};
