import React, { memo } from "react";

import { sameNodePosition } from "@sparkle/components/markdown/utils";

import { MarkdownNode } from "./types";

interface StrongBlockProps {
  children: React.ReactNode;
  node?: MarkdownNode;
}

export const MemoStrongBlock = memo(
  ({ children }: StrongBlockProps) => {
    return (
      <strong className="s-font-semibold s-text-foreground dark:s-text-foreground-night">
        {children}
      </strong>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);

MemoStrongBlock.displayName = "StrongBlock";

export const MemoHorizontalRuleBlock = memo(() => {
  return (
    <div className="s-my-6 s-border-b s-border-primary-150 dark:s-border-primary-150-night" />
  );
});

MemoHorizontalRuleBlock.displayName = "HorizontalRuleBlock";
