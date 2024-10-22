import type { Meta } from "@storybook/react";
import React from "react";

import { Label, Switch } from "../index_with_tw_base";

const meta = {
  title: "NewPrimitives/Switch",
} satisfies Meta;

export default meta;

export function Demo() {
  return (
    <div className="s-flex s-flex-col s-gap-6">
      <SwitchBasic />
    </div>
  );
}

export const SwitchBasic = () => (
  <div className="s-flex s-items-center s-space-x-2">
    <Switch id="airplane-mode" />
    <Label htmlFor="airplane-mode">Airplane Mode</Label>
  </div>
);
