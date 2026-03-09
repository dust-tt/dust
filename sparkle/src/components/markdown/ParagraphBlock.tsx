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
  [
    "s-whitespace-pre-wrap s-break-words s-font-normal first:s-pt-0 last:s-pb-0",
  ],
  {
    variants: {
      compactSpacing: {
        true: ["s-py-0"],
        false: ["s-py-1 @md:s-py-2 @md:s-leading-7"],
      },
    },
  }
);

export const ParagraphBlock = memo(
  ({ children }: { children: React.ReactNode; node?: MarkdownNode }) => {
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
