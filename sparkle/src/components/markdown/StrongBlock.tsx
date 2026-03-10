import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import React, { memo } from "react";

interface StrongBlockProps {
  children?: React.ReactNode;
  node?: MarkdownNode;
}

export const StrongBlock = memo(
  ({ children }: StrongBlockProps) => (
    <strong className="s-font-semibold s-text-foreground dark:s-text-foreground-night">
      {children}
    </strong>
  ),
  (prev, next) => sameNodePosition(prev.node, next.node)
);
StrongBlock.displayName = "StrongBlock";
