import type { Meta } from "@storybook/react";
import React from "react";

import { Button, TruncatedCollapsibleContent } from "../index_with_tw_base";

const meta = {
  title: "Components/TruncatedCollapsibleContent",
  component: TruncatedCollapsibleContent,
} satisfies Meta<typeof TruncatedCollapsibleContent>;

export default meta;

const LONG_TEXT = Array(20)
  .fill(
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris."
  )
  .join("\n\n");

export const WithFooter = () => (
  <div className="s-w-[600px]">
    <TruncatedCollapsibleContent
      footer={
        <div className="s-flex s-gap-2">
          <Button variant="outline" size="xs" label="Copy" />
          <Button variant="outline" size="xs" label="Share" />
        </div>
      }
    >
      <p className="s-whitespace-pre-line">{LONG_TEXT}</p>
    </TruncatedCollapsibleContent>
  </div>
);

export const Animated = () => (
  <div className="s-w-[600px]">
    <TruncatedCollapsibleContent animated animationDurationMs={300}>
      <p className="s-whitespace-pre-line">{LONG_TEXT}</p>
    </TruncatedCollapsibleContent>
  </div>
);

export const CustomThreshold = () => (
  <div className="s-w-[600px]">
    <TruncatedCollapsibleContent
      thresholdPx={200}
      collapsedHeightPx={150}
      expandLabel="Read more"
      collapseLabel="Read less"
    >
      <p className="s-whitespace-pre-line">{LONG_TEXT}</p>
    </TruncatedCollapsibleContent>
  </div>
);
