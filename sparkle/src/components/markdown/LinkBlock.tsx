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
          "s-break-all s-font-semibold s-transition-all s-duration-200 s-ease-in-out hover:s-underline",
          "s-text-highlight dark:s-text-highlight-night",
          "hover:s-text-highlight-400 dark:hover:s-text-highlight-400-night",
          "active:s-text-highlight-dark dark:active:s-text-highlight-dark-night",
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
