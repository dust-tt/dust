import type { Meta } from "@storybook/react";
import React from "react";

import {
  Button,
  Icon,
  Label,
  LockIcon,
  RadioGroup,
  RadioGroupChoice,
  RadioGroupItem,
} from "@sparkle/index_with_tw_base";

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
          <RadioGroupItem value="option-three" id="option-three" />
          <Label htmlFor="option-two">Option Three</Label>
        </div>
      </RadioGroup>
      <RadioGroup defaultValue="option-one">
        <div className="s-flex s-items-center s-space-x-2">
          <RadioGroupItem
            value="option-one"
            id="option-one"
            size="sm"
            tooltipMessage="This is a nice tooltip message"
            disabled
            tooltipAsChild
          />
          <Label htmlFor="option-one">Option One</Label>
        </div>
        <div className="s-flex s-items-center s-space-x-2">
          <RadioGroupItem
            value="option-two"
            id="option-two"
            size="sm"
            disabled={true}
            checked
          />
          <Label htmlFor="option-two">Option Two</Label>
        </div>
        <div className="s-flex s-items-center s-space-x-2">
          <RadioGroupItem value="option-three" id="option-three" size="sm" />
          <Label htmlFor="option-two">Option Three</Label>
        </div>
      </RadioGroup>
    </div>
  );
};

export const RadioGroupWithChildrenExample = () => {
  return (
    <div className="s-flex s-flex-col s-gap-10">
      <RadioGroup defaultValue="option-one">
        <RadioGroupChoice
          value="option-one"
          id="option-one"
          className="s-border s-border-red-500"
        >
          Option two
        </RadioGroupChoice>
        <RadioGroupChoice
          value="option-two"
          id="option-two"
          iconPosition="center"
          className="s-border s-border-action-700"
        >
          <div className="s-flex s-flex-col s-gap-2">
            <Icon visual={LockIcon} />
            <Label>Lore ipsum</Label>
            <Button label="Click me" />
          </div>
        </RadioGroupChoice>
        <RadioGroupChoice
          value="option-three"
          id="option-three"
          className="s-border s-border-green-500"
        ></RadioGroupChoice>
      </RadioGroup>
    </div>
  );
};
