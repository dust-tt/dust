import type { Meta } from "@storybook/react";
import React from "react";

import {
  Icon,
  RobotIcon,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "../index_with_tw_base";

const meta = {
  title: "Primitives/Tooltip",
  component: TooltipProvider,
} satisfies Meta<typeof TooltipProvider>;

export default meta;

export const Tooltip = () => (
  <TooltipProvider>
    <TooltipRoot>
      <TooltipTrigger>
        Hover
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>Add to library</p>
      </TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
)

export const TooltipWithChildren = () => (
  <TooltipProvider delayDuration={800} skipDelayDuration={500}>
    <TooltipRoot onOpenChange={
      (open: boolean) => {console.log(`Is open: ${open}`)}
    }>
      <TooltipTrigger>
        <Icon visual={RobotIcon} size="xs" />
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={50}>
        This is a tooltip with a very long label that should wrap onto multiple lines. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor.
      </TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
)