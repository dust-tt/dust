import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Tooltip } from "../index_with_tw_base";

const meta = {
  title: "Primitives/Tooltip",
  component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TooltipAbove: Story = {
  args: {
    label: "This is a tooltip",
    children: "Hover me",
    position: "above",
  },
};

export const TooltipBelow: Story = {
  args: {
    label: "This is a tooltip",
    children: "Hover me",
    position: "below",
  },
};

export const ToolTipWithContent = () => (
  <div className="s-pl-32">
    <Tooltip
      contentChildren={
        <div className="s-w-64">
          <div className="s-flex s-flex-col s-gap-y-2 s-break-words">
            <div className="s-flex s-font-semibold">
              This is a more complex tooltip:
            </div>
            <div className="s-flex s-flex-wrap s-break-words">
              It has some content that is long here and describes something
              about the content associated with this.
            </div>
          </div>
        </div>
      }
      position="below"
    >
      Hover me
    </Tooltip>
  </div>
);

export const TooltipLongLabel = () => (
  <div className="s-pl-64">
    <Tooltip
      label="This is a tooltip with a very long label that should wrap onto multiple lines. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor."
      position="below"
    >
      Hover me
    </Tooltip>
  </div>
);
