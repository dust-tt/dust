import type { Meta } from "@storybook/react";
import React from "react";

import { Skeleton } from "@sparkle/components";

const meta = {
  title: "NewPrimitives/Skeleton",
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
      <Skeleton className="s-h-[125px] s-w-[250px] s-rounded-xl" />
      <div className="s-space-y-2">
        <Skeleton className="s-h-4 s-w-[250px]" />
        <Skeleton className="s-h-4 s-w-[200px]" />
      </div>
    </div>
  );
}

export function SkeletonDemo2() {
  return (
    <div className="s-flex s-items-center s-space-x-4">
      <Skeleton className="s-h-12 s-w-12 s-rounded-full" />
      <div className="s-space-y-2">
        <Skeleton className="s-h-4 s-w-[250px]" />
        <Skeleton className="s-h-4 s-w-[200px]" />
      </div>
    </div>
  );
}
