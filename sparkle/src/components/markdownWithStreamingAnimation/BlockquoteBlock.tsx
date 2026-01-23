import { cva } from "class-variance-authority";
import React, { memo } from "react";
import type { ReactMarkdownProps } from "react-markdown/lib/ast-to-react";

import { ContentBlockWrapper } from "@sparkle/components";
import { sameNodePosition } from "@sparkle/components/markdownWithStreamingAnimation/utils";

export const blockquoteVariants = cva(
  [
    "s-w-full s-text-base s-italic s-p-3",
    "s-relative",
    "before:s-content-[''] before:s-absolute before:s-left-0 before:s-top-3 before:s-bottom-3",
    "before:s-w-1 before:s-bg-faint dark:before:s-bg-faint-night",
    "before:s-rounded-full",
  ],
  {
    variants: {
      variant: {
        surface: [
          "s-text-foreground dark:s-text-foreground-night",
          "s-bg-transparent",
        ],
      },
      buttonDisplay: {
        inside: ["s-pr-12"],
        outside: [],
      },
    },
  }
);

interface BlockquoteBlockProps extends Omit<
  ReactMarkdownProps,
  "children" | "node"
> {
  children: React.ReactNode;
  variant?: "surface";
  buttonDisplay?: "inside" | "outside" | null; // null to hide buttons
  node?: ReactMarkdownProps["node"];
}

export const MemoBlockquoteBlock = memo<BlockquoteBlockProps>(
  ({
    children,
    variant = "surface",
    buttonDisplay = "inside",
    node: _node,
  }) => {
    const elementAt1 = React.Children.toArray(children)[1];
    const childrenContent =
      elementAt1 && React.isValidElement(elementAt1)
        ? elementAt1.props.children
        : null;

    // Convert array content to string if necessary
    const contentAsString = Array.isArray(childrenContent)
      ? childrenContent.filter((c) => typeof c === "string").join("")
      : childrenContent;

    // Only pass content if it exists
    const clipboardContent = contentAsString
      ? { "text/plain": contentAsString }
      : undefined;

    return (
      <ContentBlockWrapper
        content={clipboardContent}
        className="s-my-2"
        buttonDisplay={buttonDisplay}
      >
        <blockquote className={blockquoteVariants({ variant, buttonDisplay })}>
          {children}
        </blockquote>
      </ContentBlockWrapper>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) &&
      prev.variant === next.variant &&
      prev.buttonDisplay === next.buttonDisplay
    );
  }
);

MemoBlockquoteBlock.displayName = "MemoBlockquoteBlock";
