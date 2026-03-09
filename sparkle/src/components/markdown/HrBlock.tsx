import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import React, { memo } from "react";

export const HrBlock = memo(
  (_props: { node?: MarkdownNode }) => (
    <div className="s-my-6 s-border-b s-border-primary-150 dark:s-border-primary-150-night" />
  ),
  (prev, next) => sameNodePosition(prev.node, next.node)
);
HrBlock.displayName = "HrBlock";
