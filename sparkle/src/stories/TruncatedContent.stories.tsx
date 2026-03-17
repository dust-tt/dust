import type { Meta } from "@storybook/react";
import React from "react";

import { Button, TruncatedContent } from "../index_with_tw_base";

const meta = {
  title: "Components/TruncatedContent",
  component: TruncatedContent,
} satisfies Meta<typeof TruncatedContent>;

export default meta;

const LONG_TEXT = Array(20)
  .fill(
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris."
  )
  .join("\n\n");

export const WithFooter = () => (
  <div className="s-w-[600px]">
    <TruncatedContent
      footer={
        <div className="s-flex s-gap-2">
          <Button variant="outline" size="xs" label="Copy" />
          <Button variant="outline" size="xs" label="Share" />
        </div>
      }
    >
      <p className="s-whitespace-pre-line">{LONG_TEXT}</p>
    </TruncatedContent>
  </div>
);

export const Animated = () => (
  <div className="s-w-[600px]">
    <TruncatedContent animated animationDurationMs={300}>
      <p className="s-whitespace-pre-line">{LONG_TEXT}</p>
    </TruncatedContent>
  </div>
);

export const CustomThreshold = () => (
  <div className="s-w-[600px]">
    <TruncatedContent
      thresholdPx={200}
      collapsedHeightPx={150}
      expandLabel="Read more"
      collapseLabel="Read less"
    >
      <p className="s-whitespace-pre-line">{LONG_TEXT}</p>
    </TruncatedContent>
  </div>
);
