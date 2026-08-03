import type { Meta } from "@storybook/react";
import React from "react";

import { LoadingBlock } from "@sparkle/components";

const meta = {
  title: "Feedback & Status/LoadingBlock",
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
} satisfies Meta;

export default meta;

export function Demo() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonDemo />
      <SkeletonDemo2 />
    </div>
  );
}

export function SkeletonDemo() {
  return (
    <div className="flex flex-col space-y-3">
      <LoadingBlock className="h-[125px] w-[250px] rounded-xl" />
      <div className="space-y-2">
        <LoadingBlock className="h-4 w-[250px]" />
        <LoadingBlock className="h-4 w-[200px]" />
      </div>
    </div>
  );
}

export function SkeletonDemo2() {
  return (
    <div className="flex items-center space-x-4">
      <LoadingBlock className="h-12 w-12 rounded-full" />
      <div className="space-y-2">
        <LoadingBlock className="h-4 w-[250px]" />
        <LoadingBlock className="h-4 w-[200px]" />
      </div>
    </div>
  );
}
