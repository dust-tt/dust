import { cva } from "class-variance-authority";
import React, { memo } from "react";
import type { ReactMarkdownProps } from "react-markdown/lib/ast-to-react";

import { sameNodePosition } from "@sparkle/components/markdownWithStreamingAnimation/utils";

export const preBlockVariants = cva(
  [
    "s-my-2 s-w-full s-break-all s-rounded-2xl s-border",
    "s-border-border dark:s-border-border-night",
  ],
  {
    variants: {
      variant: {
        surface: "s-bg-muted-background dark:s-bg-muted-background-night",
      },
    },
  }
);

interface PreBlockProps extends Omit<ReactMarkdownProps, "children" | "node"> {
  children: React.ReactNode;
  variant?: "surface";
  node?: ReactMarkdownProps["node"];
}

export const MemoPreBlock = memo<PreBlockProps>(
  ({ children, variant = "surface", node: _node }) => {
    const validChildrenContent =
      Array.isArray(children) && children[0]
        ? children[0].props.children[0]
        : null;

    let fallbackData: string | null = null;
    if (!validChildrenContent) {
      fallbackData =
        Array.isArray(children) && children[0]
          ? children[0].props?.node?.data?.meta
          : null;
    }

    return (
      <pre className={preBlockVariants({ variant })}>
        {validChildrenContent ? children : fallbackData || children}
      </pre>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && prev.variant === next.variant
    );
  }
);

MemoPreBlock.displayName = "MemoPreBlock";
