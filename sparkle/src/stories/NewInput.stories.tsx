import { Meta } from "@storybook/react";
import React from "react";

import {
  Label,
  NewButton,
  NewButtonBar,
  NewInput,
} from "../index_with_tw_base";

const meta = {
  title: "NewPrimitives/NewInput",
} satisfies Meta;

export default meta;

export const TabExample = () => {
  return (
    <div className="s-flex s-flex-col s-gap-10">
      <NewInputDemo />
    </div>
  );
};

export function NewInputDemo() {
  return (
    <div className="s-flex s-flex-col s-gap-6">
      <NewInput type="email" placeholder="Email" />
      <NewInput type="email" placeholder="Email" disabled />
      <div className="grid w-full max-w-sm items-center gap-1.5">
        <Label htmlFor="picture">Picture</Label>
        <NewInput id="picture" type="file" />
      </div>
      <NewButtonBar>
        <NewInput type="email" placeholder="Email" />
        <NewButton
          type="submit"
          label="Subscribe"
          variant="highlight"
          isPulsing
        />
      </NewButtonBar>
    </div>
  );
}
