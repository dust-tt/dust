import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { cva } from "class-variance-authority";
import React, { memo } from "react";

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

export const PreBlock = memo(
  ({
    children,
    variant = "surface",
  }: {
    children: React.ReactNode;
    variant?: "surface";
    node?: MarkdownNode;
  }) => {
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
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && prev.variant === next.variant
);
PreBlock.displayName = "PreBlock";
