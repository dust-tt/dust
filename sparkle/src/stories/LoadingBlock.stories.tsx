import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

import { LoadingBlock } from "@sparkle/components";

const meta = {
  title: "Feedback & Status/LoadingBlock",
  component: LoadingBlock,
  parameters: {
    docs: {
      description: {
        component: `A skeleton placeholder that pulses a translucent tint (the \`loading\` token) while content loads, so it reads on any surface in both themes. Size and shape it entirely through **className** (e.g. \`h-4 w-[250px]\`, \`rounded-full\`), composing several blocks to mirror the layout of the content being fetched.

**When to use**
- To reserve space and signal loading for content whose shape is known ahead of time (cards, avatars, text lines).

**Guidelines**
- Match each block's dimensions and rounding to the real element it stands in for, so the swap feels seamless.
- For an indeterminate spinner with no known layout, use a **Spinner** or **SpinnerBrand** instead.
- For an empty result rather than a loading state, use an **EmptyCTA**.`,
      },
    },
  },
} satisfies Meta<typeof LoadingBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A single block shaped purely through \`className\` — here one line of
 * text. This is the whole API: the component takes no other props.
 * @summary Single skeleton block sized via className.
 */
export const SingleBlock: Story = {
  args: {
    className: "h-4 w-[250px]",
  },
};

/**
 * Blocks composed to stand in for a media card: a large rounded thumbnail
 * above two text lines of decreasing width.
 * @summary Card-shaped skeleton composition.
 */
export const CardPlaceholder: Story = {
  render: () => (
    <div className="flex flex-col space-y-3">
      <LoadingBlock className="h-[125px] w-[250px] rounded-xl" />
      <div className="space-y-2">
        <LoadingBlock className="h-4 w-[250px]" />
        <LoadingBlock className="h-4 w-[200px]" />
      </div>
    </div>
  ),
};

/**
 * Blocks composed to stand in for a list row: a circular avatar
 * (\`rounded-full\`) next to two text lines.
 * @summary List-row skeleton with a circular avatar.
 */
export const ListItemPlaceholder: Story = {
  render: () => (
    <div className="flex items-center space-x-4">
      <LoadingBlock className="h-12 w-12 rounded-full" />
      <div className="space-y-2">
        <LoadingBlock className="h-4 w-[250px]" />
        <LoadingBlock className="h-4 w-[200px]" />
      </div>
    </div>
  ),
};
