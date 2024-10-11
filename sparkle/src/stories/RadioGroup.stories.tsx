import type { Meta } from "@storybook/react";
import React from "react";

import { Label, RadioGroup, RadioGroupItem } from "@sparkle/index_with_tw_base";

const meta = {
  title: "Primitives/RadioGroup",
} satisfies Meta;

export default meta;
export const RadioGroupExample = () => {
  return (
    <div className="s-flex s-flex-col s-gap-10">
      <RadioGroup defaultValue="option-one">
        <div className="s-flex s-items-center s-space-x-2">
          <RadioGroupItem value="option-one" id="option-one" />
          <Label htmlFor="option-one">Option One</Label>
        </div>
        <div className="s-flex s-items-center s-space-x-2">
          <RadioGroupItem value="option-two" id="option-two" />
          <Label htmlFor="option-two">Option Two</Label>
        </div>
        <div className="s-flex s-items-center s-space-x-2">
          <RadioGroupItem value="option-two" id="option-three"/>
          <Label htmlFor="option-two">Option Three</Label>
        </div>
      </RadioGroup>
      <RadioGroup defaultValue="option-one">
        <div className="s-flex s-items-center s-space-x-2">
          <RadioGroupItem value="option-one" id="option-one" size="sm" />
          <Label htmlFor="option-one">Option One</Label>
        </div>
        <div className="s-flex s-items-center s-space-x-2">
          <RadioGroupItem value="option-two" id="option-two" size="sm" />
          <Label htmlFor="option-two">Option Two</Label>
        </div>
        <div className="s-flex s-items-center s-space-x-2">
          <RadioGroupItem value="option-two" id="option-three" size="sm" />
          <Label htmlFor="option-two">Option Three</Label>
        </div>
      </RadioGroup>
    </div>
  );
};
