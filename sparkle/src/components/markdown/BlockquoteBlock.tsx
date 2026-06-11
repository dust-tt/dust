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
    "s:w-full s:text-base s:italic s:p-3",
    "s:relative",
    "s:before:content-[''] s:before:absolute s:before:left-0 s:before:top-3 s:before:bottom-3",
    "s:before:w-1 s:before:bg-faint s:dark:before:bg-faint-night",
    "s:before:rounded-full",
  ],
  {
    variants: {
      variant: {
        surface: [
          "s:text-foreground s:dark:text-foreground-night",
          "s:bg-transparent",
        ],
      },
      buttonDisplay: {
        inside: ["s:pr-12"],
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
        className="s:my-2"
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
