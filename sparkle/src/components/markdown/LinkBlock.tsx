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
  /** hast node from react-markdown; its position is used to skip re-renders during streaming. */
  node?: MarkdownNode;
  /** Click handler for the anchor, e.g. to intercept in-app navigation. */
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  rel?: string;
  target?: React.HTMLAttributeAnchorTarget;
  title?: string;
}

/**
 * Renders links inside Markdown output as highlighted anchors, defaulting to
 * `target="_blank"` with `rel="noopener noreferrer"` when no target is given.
 * @summary Link renderer for Markdown.
 */
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
          "break-all font-semibold transition-all duration-200 ease-in-out hover:underline",
          "text-highlight",
          "hover:text-highlight-400",
          "active:text-highlight-dark",
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
