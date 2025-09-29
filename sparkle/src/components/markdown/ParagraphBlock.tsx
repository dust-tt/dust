import { cva } from "class-variance-authority";
import React, { memo } from "react";

import { cn } from "@sparkle/lib";

import { MarkdownNode } from "./types";
import { sameNodePosition, sameTextStyling } from "./utils";

export const paragraphBlockVariants = cva([
  "s-whitespace-pre-wrap s-break-words s-font-normal first:s-pt-0 last:s-pb-0",
  "s-py-1 @md:s-py-2 @md:s-leading-7",
]);

interface ParagraphBlockProps {
  children: React.ReactNode;
  textColor: string;
  textSize: string;
  node?: MarkdownNode;
}

export const MemoParagraphBlock = memo(
  ({ children, textColor, textSize }: ParagraphBlockProps) => {
    return (
      <div className={cn(paragraphBlockVariants(), textSize, textColor)}>
        {children}
      </div>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
);

MemoParagraphBlock.displayName = "ParagraphBlock";
