import React, { memo } from "react";

import { sameNodePosition } from "@sparkle/components/markdown/utils";
import { cn } from "@sparkle/lib/utils";

import { MarkdownNode } from "./types";

interface LinkBlockProps {
  href?: string;
  children: React.ReactNode;
  node?: MarkdownNode;
}

export const MemoLinkBlock = memo(
  ({ href, children }: LinkBlockProps) => {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "s-break-all s-font-semibold s-transition-all s-duration-200 s-ease-in-out hover:s-underline",
          "s-text-highlight dark:s-text-highlight-night",
          "hover:s-text-highlight-400 dark:hover:s-text-highlight-400-night",
          "active:s-text-highlight-dark dark:active:s-text-highlight-dark-night"
        )}
      >
        {children}
      </a>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && prev.href === next.href
);

MemoLinkBlock.displayName = "LinkBlock";
