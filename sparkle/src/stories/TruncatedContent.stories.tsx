import type { Meta } from "@storybook/react";
import React from "react";

import { Button, TruncatedContent } from "../index_with_tw_base";

const meta = {
  title: "Data Display/TruncatedContent",
  component: TruncatedContent,
  parameters: {
    docs: {
      description: {
        component: `Clamps tall content to a collapsed height and reveals a show-more / show-less toggle when it overflows. Configure the overflow trigger with **thresholdPx** and the clamp height with **collapsedHeightPx**, customize the toggle text via **expandLabel** / **collapseLabel**, opt into a height transition with **animated** (and **animationDurationMs**), and pin extra controls with the **footer** slot.

**When to use**
- For long text or rich blocks (descriptions, transcripts) that should stay compact until expanded.

**Guidelines**
- Tune **thresholdPx** so short content renders fully without a redundant toggle.
- Use the **footer** slot for actions that should remain visible regardless of expansion state.`,
      },
    },
  },
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
