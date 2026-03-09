import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import React, { memo } from "react";

export const StrongBlock = memo(
  ({ children }: { children?: React.ReactNode; node?: MarkdownNode }) => (
    <strong className="s-font-semibold s-text-foreground dark:s-text-foreground-night">
      {children}
    </strong>
  ),
  (prev, next) => sameNodePosition(prev.node, next.node)
);
StrongBlock.displayName = "StrongBlock";
