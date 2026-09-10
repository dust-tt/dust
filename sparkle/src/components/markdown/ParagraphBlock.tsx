import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
import { markdownParagraphSize } from "@sparkle/components/markdown/markdownSizes";
import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { cn } from "@sparkle/lib";
import { cva } from "class-variance-authority";
import React, { memo } from "react";

export const paragraphBlockVariants = cva(
  ["whitespace-pre-wrap break-words font-normal first:pt-0 last:pb-0"],
  {
    variants: {
      compactSpacing: {
        true: ["py-0"],
        // The conversation column is capped at 65ch (~690px in Geist), so a
        // 48rem (@md) container is never reached inside a message; @sm (40rem)
        // is the "comfortable column" step. Below it (side panels, phones) stay
        // compact.
        false: ["py-1 @sm:pt-2 @sm:pb-[10px] @sm:leading-relaxed"],
      },
    },
  }
);

interface ParagraphBlockProps {
  children: React.ReactNode;
  node?: MarkdownNode;
}

/**
 * Renders paragraphs inside Markdown output (as a `div` so nested block
 * content stays valid), applying the typography and spacing options from
 * MarkdownStyleContext.
 * @summary Paragraph renderer for Markdown.
 */
export const ParagraphBlock = memo(
  ({ children }: ParagraphBlockProps) => {
    const { textColor, forcedTextSize, compactSpacing } = useMarkdownStyle();
    const textSize = forcedTextSize ?? markdownParagraphSize;
    return (
      <div
        className={cn(
          paragraphBlockVariants({ compactSpacing }),
          textSize,
          textColor
        )}
      >
        {children}
      </div>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);
ParagraphBlock.displayName = "ParagraphBlock";
