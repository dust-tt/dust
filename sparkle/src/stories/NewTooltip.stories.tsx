import type { Meta } from "@storybook/react";
import React from "react";

import {
  NewTooltip,
  NewTooltipContent,
  NewTooltipProvider,
  NewTooltipTrigger,
} from "../index_with_tw_base";

const meta = {
  title: "NewPrimitives/Tooltip",
} satisfies Meta;

export default meta;

export const NewTooltipLongLabel = () => (
  <div className="s-flex s-flex-col s-gap-16 s-p-12">
    <NewTooltipProvider>
      <NewTooltip>
        <NewTooltipTrigger>Hover</NewTooltipTrigger>
        <NewTooltipContent>
          <p>Add to library</p>
        </NewTooltipContent>
      </NewTooltip>
    </NewTooltipProvider>
    <NewTooltipProvider>
      <NewTooltip>
        <NewTooltipTrigger>Hover (large content)</NewTooltipTrigger>
        <NewTooltipContent>
          <p>
            Args table with interactive controls couldn't be auto-generated
            Controls give you an easy to use interface to test your components.
            Set your story args and you'll see controls appearing here
            automatically.
          </p>
        </NewTooltipContent>
      </NewTooltip>
    </NewTooltipProvider>
  </div>
);
