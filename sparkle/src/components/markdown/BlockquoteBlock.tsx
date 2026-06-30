import { ContentBlockWrapper } from "@sparkle/components/markdown/ContentBlockWrapper";
import { MarkdownContentContext } from "@sparkle/components/markdown/MarkdownContentContext";
import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { cva } from "class-variance-authority";
import React, { memo, useContext, useMemo } from "react";

export const blockquoteVariants = cva(
  [
    "w-full text-base italic p-3",
    "relative",
    "before:content-[''] before:absolute before:left-0 before:top-3 before:bottom-3",
    "before:w-1 before:bg-faint",
    "before:rounded-full",
  ],
  {
    variants: {
      variant: {
        surface: ["text-foreground", "bg-transparent"],
      },
      buttonDisplay: {
        inside: ["pr-12"],
        outside: [],
      },
    },
  }
);

interface BlockquoteBlockProps {
  children: React.ReactNode;
  variant?: "surface";
  node?: MarkdownNode;
}

export const BlockquoteBlock = memo(
  ({ children, variant = "surface", node }: BlockquoteBlockProps) => {
    const { canCopyQuotes } = useMarkdownStyle();
    const { content } = useContext(MarkdownContentContext);
    const buttonDisplay = canCopyQuotes ? "inside" : null;

    const clipboardContent = useMemo(() => {
      if (!node?.position) {
        return undefined;
      }
      const lines = content.split("\n");
      // hast positions are 1-indexed; end.line is the last line (inclusive).
      const blockquoteLines = lines.slice(
        node.position.start.line - 1,
        node.position.end.line
      );
      // Strip the leading "> " blockquote markers to get the raw content.
      const stripped = blockquoteLines
        .map((line) => line.replace(/^>\s?/, ""))
        .join("\n");

      return stripped ? { "text/plain": stripped } : undefined;
    }, [content, node]);

    return (
      <ContentBlockWrapper
        content={clipboardContent}
        className="my-2"
        buttonDisplay={buttonDisplay}
      >
        <blockquote className={blockquoteVariants({ variant, buttonDisplay })}>
          {children}
        </blockquote>
      </ContentBlockWrapper>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && prev.variant === next.variant
);
BlockquoteBlock.displayName = "BlockquoteBlock";
