import { cva } from "class-variance-authority";
import React, { memo } from "react";

import { cn } from "@sparkle/lib";

import { MarkdownNode } from "./types";
import { sameNodePosition, sameTextStyling } from "./utils";

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

interface ParagraphBlockProps {
  children: React.ReactNode;
  textColor: string;
  textSize: string;
  node?: MarkdownNode;
  compactSpacing?: boolean;
}

export const MemoParagraphBlock = memo(
  ({ children, textColor, textSize, compactSpacing = false }: ParagraphBlockProps) => {
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
  (prev, next) =>
    sameNodePosition(prev.node, next.node) &&
    sameTextStyling(prev, next) &&
    prev.compactSpacing === next.compactSpacing
);

MemoParagraphBlock.displayName = "ParagraphBlock";
