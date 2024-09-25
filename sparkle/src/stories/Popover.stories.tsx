import type { Meta } from "@storybook/react";
import React from "react";

import { Popover, PopoverContent, PopoverTrigger } from "../index_with_tw_base";

const meta = {
  title: "NewPrimitives/Popover",
  component: Popover,
} satisfies Meta<typeof Popover>;

export default meta;

export const ToolTipWithContent = () => (
  <div className="s-pl-32">
    <Popover>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>Place content for the popover here.</PopoverContent>
    </Popover>
  </div>
);
