import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { cn } from "@sparkle/lib";
import React, { memo } from "react";

interface LinkBlockProps {
  href?: string;
  children: React.ReactNode;
  node?: MarkdownNode;
}

export const LinkBlock = memo(
  ({ href, children }: LinkBlockProps) => (
    <a
      href={href}
      title={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "s:break-all s:font-semibold s:transition-all s:duration-200 s:ease-in-out s:hover:underline",
        "s:text-highlight s:dark:text-highlight-night",
        "s:hover:text-highlight-400 s:dark:hover:text-highlight-400-night",
        "s:active:text-highlight-dark s:dark:active:text-highlight-dark-night"
      )}
    >
      {children}
    </a>
  ),
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && prev.href === next.href
);
LinkBlock.displayName = "LinkBlock";
