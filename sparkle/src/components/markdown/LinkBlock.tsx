import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { cn } from "@sparkle/lib";
import React, { memo } from "react";

interface LinkBlockProps {
  href?: string;
  children: React.ReactNode;
  className?: string;
  node?: MarkdownNode;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  rel?: string;
  target?: React.HTMLAttributeAnchorTarget;
  title?: string;
}

export const LinkBlock = memo(
  ({
    href,
    children,
    className,
    onClick,
    rel: providedRel,
    target: providedTarget,
    title,
  }: LinkBlockProps) => {
    const target = providedTarget ?? "_blank";
    const rel =
      providedRel ?? (target === "_blank" ? "noopener noreferrer" : undefined);

    return (
      <a
        href={href}
        title={title ?? href}
        target={target}
        rel={rel}
        onClick={onClick}
        className={cn(
          "break-all font-semibold transition-colors duration-150 ease-out hover:underline underline-offset-2",
          // highlight-500 sits at 3.2:1 on white — below AA for body links.
          // 700 clears 4.5:1; dark mode keeps 500 (5.8:1 on the dark bg).
          "text-highlight-700 dark:text-highlight-500",
          "hover:text-highlight-600 dark:hover:text-highlight-400",
          "active:text-highlight-800 dark:active:text-highlight-600",
          className
        )}
      >
        {children}
      </a>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) &&
    prev.href === next.href &&
    prev.rel === next.rel &&
    prev.target === next.target &&
    prev.title === next.title &&
    prev.className === next.className &&
    prev.onClick === next.onClick
);
LinkBlock.displayName = "LinkBlock";
