import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { Button, TruncatedContent } from "../index_with_tw_base";

const meta = {
  title: "Data Display/TruncatedContent",
  component: TruncatedContent,
  decorators: [
    (Story) => (
      <div className="w-[600px]">
        <Story />
      </div>
    ),
  ],
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
type Story = StoryObj<typeof meta>;

const LONG_TEXT = Array(20)
  .fill(
    "This agent answers questions about the company knowledge base. It searches connected Notion pages and Slack threads, ranks the retrieved passages by relevance, and cites every source it uses so the answer can be verified."
  )
  .join("\n\n");

/**
 * Simplest usage: long content clamped to the default collapsed height with
 * a Show more / Show less toggle. Content starts collapsed because
 * **defaultCollapsed** defaults to `true`; the **variant** prop switches the
 * toggle's button style (`default` outline vs `light` ghost).
 * @summary Clamped content with a show-more toggle.
 */
export const Default: Story = {
  args: {
    children: <p className="whitespace-pre-line">{LONG_TEXT}</p>,
  },
};

/**
 * The **footer** slot pins extra controls next to the toggle; they stay
 * visible whether the content is collapsed or expanded.
 * @summary Persistent actions in the footer slot.
 */
export const WithFooter: Story = {
  args: {
    children: <p className="whitespace-pre-line">{LONG_TEXT}</p>,
    footer: (
      <div className="flex gap-2">
        <Button variant="outline" size="xs" label="Copy" />
        <Button variant="outline" size="xs" label="Share" />
      </div>
    ),
  },
};

/**
 * With **animated**, expanding and collapsing transitions the height instead
 * of snapping; **animationDurationMs** tunes the transition length.
 * @summary Animated expand/collapse transition.
 */
export const Animated: Story = {
  args: {
    animated: true,
    animationDurationMs: 300,
    children: <p className="whitespace-pre-line">{LONG_TEXT}</p>,
  },
};

/**
 * Custom clamp tuning: **thresholdPx** sets how tall content must be before
 * the toggle appears, **collapsedHeightPx** sets the clamped height, and
 * **expandLabel** / **collapseLabel** replace the default toggle text.
 * @summary Custom threshold, height, and labels.
 */
export const CustomThreshold: Story = {
  args: {
    thresholdPx: 200,
    collapsedHeightPx: 150,
    expandLabel: "Read more",
    collapseLabel: "Read less",
    children: <p className="whitespace-pre-line">{LONG_TEXT}</p>,
  },
};
