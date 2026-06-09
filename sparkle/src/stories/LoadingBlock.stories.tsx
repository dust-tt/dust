import type { Meta } from "@storybook/react";
import React from "react";

import { LoadingBlock } from "@sparkle/components";

const meta = {
  title: "Feedback & Status/LoadingBlock",
  parameters: {
    docs: {
      description: {
        component: `A skeleton placeholder that animates a subtle shimmer while content loads. Size and shape it entirely through **className** (e.g. \`s-h-4 s-w-[250px]\`, \`s-rounded-full\`), composing several blocks to mirror the layout of the content being fetched.

**When to use**
- To reserve space and signal loading for content whose shape is known ahead of time (cards, avatars, text lines).

**Guidelines**
- Match each block's dimensions and rounding to the real element it stands in for, so the swap feels seamless.
- For an indeterminate spinner with no known layout, use a **Spinner** or **SpinnerBrand** instead.
- For an empty result rather than a loading state, use an **EmptyCTA**.`,
      },
    },
  },
} satisfies Meta;

export default meta;

export function Demo() {
  return (
    <div className="s-flex s-flex-col s-gap-6">
      <SkeletonDemo />
      <SkeletonDemo2 />
    </div>
  );
}

export function SkeletonDemo() {
  return (
    <div className="s-flex s-flex-col s-space-y-3">
      <LoadingBlock className="s-h-[125px] s-w-[250px] s-rounded-xl" />
      <div className="s-space-y-2">
        <LoadingBlock className="s-h-4 s-w-[250px]" />
        <LoadingBlock className="s-h-4 s-w-[200px]" />
      </div>
    </div>
  );
}

export function SkeletonDemo2() {
  return (
    <div className="s-flex s-items-center s-space-x-4">
      <LoadingBlock className="s-h-12 s-w-12 s-rounded-full" />
      <div className="s-space-y-2">
        <LoadingBlock className="s-h-4 s-w-[250px]" />
        <LoadingBlock className="s-h-4 s-w-[200px]" />
      </div>
    </div>
  );
}
