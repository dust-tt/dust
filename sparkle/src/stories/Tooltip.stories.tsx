import type { Meta } from "@storybook/react";
import React from "react";

import {
  Icon,
  RobotIcon,
  Tooltip,
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

export const TooltipExample = () => (
  <Tooltip trigger={<div>Hover</div>} label={<p>Add to library</p>} />
);

export const TooltipWithManual = () => (
  <TooltipProvider delayDuration={800} skipDelayDuration={500}>
    <TooltipRoot
      onOpenChange={(open: boolean) => {
        console.log(`Is open: ${open}`);
      }}
    >
      <TooltipTrigger>
        <Icon visual={RobotIcon} size="xs" />
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={50}>
        This is a tooltip with a very long label that should wrap onto multiple
        lines. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non
        risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec,
        ultricies sed, dolor.
      </TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
);
