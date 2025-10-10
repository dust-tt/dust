import { cva } from "class-variance-authority";
import React, { memo } from "react";

import { ContentBlockWrapper } from "@sparkle/components";

import { MarkdownNode } from "./types";
import { sameNodePosition } from "./utils";

export const blockquoteVariants = cva(
  ["s-w-full s-text-base s-italic s-rounded-2xl s-py-3 s-pl-5 s-pr-12"],
  {
    variants: {
      variant: {
        surface: [
          "s-text-foreground dark:s-text-foreground-night",
          "s-bg-muted-background dark:s-bg-muted-background-night",
        ],
      },
    },
  }
);

interface BlockquoteBlockProps {
  children: React.ReactNode;
  variant?: "surface";
  node?: MarkdownNode;
}

export const MemoBlockquoteBlock = memo(
  ({ children, variant = "surface" }: BlockquoteBlockProps) => {
    const elementAt1 = React.Children.toArray(children)[1];
    const childrenContent =
      elementAt1 && React.isValidElement(elementAt1)
        ? elementAt1.props.children
        : null;

    // Convert array content to string if necessary
    const contentAsString = Array.isArray(childrenContent)
      ? childrenContent.join("")
      : childrenContent;

    // Only pass content if it exists
    const clipboardContent = contentAsString
      ? { "text/plain": contentAsString }
      : undefined;

    return (
      <ContentBlockWrapper content={clipboardContent} className="s-my-2">
        <blockquote className={blockquoteVariants({ variant })}>
          {children}
        </blockquote>
      </ContentBlockWrapper>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && prev.variant === next.variant
);

MemoBlockquoteBlock.displayName = "BlockquoteBlock";
