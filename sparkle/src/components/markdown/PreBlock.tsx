import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { cva } from "class-variance-authority";
import React, { memo } from "react";

export const preBlockVariants = cva(
  ["my-2 w-full break-all rounded-2xl border", "border-border"],
  {
    variants: {
      variant: {
        surface: "bg-muted-background",
      },
    },
  }
);

interface PreBlockProps {
  children: React.ReactNode;
  /** Visual variant; only "surface" is currently supported. */
  variant?: "surface";
  /** hast node from react-markdown; its position is used to skip re-renders during streaming. */
  node?: MarkdownNode;
}

/**
 * Renders `<pre>` elements inside Markdown output as the rounded container
 * around fenced code blocks, falling back to the node's meta string when the
 * code content is empty.
 * @summary Pre-element container for Markdown code blocks.
 */
export const PreBlock = memo(
  ({ children, variant = "surface" }: PreBlockProps) => {
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
