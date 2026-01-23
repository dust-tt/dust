import { cva } from "class-variance-authority";
import React, { memo } from "react";
import type { ReactMarkdownProps } from "react-markdown/lib/ast-to-react";

import {
  sameNodePosition,
  sameTextStyling,
} from "@sparkle/components/markdownWithStreamingAnimation/utils";
import { cn } from "@sparkle/lib";

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

interface ParagraphBlockProps extends Omit<ReactMarkdownProps, "children" | "node"> {
  children: React.ReactNode;
  textColor: string;
  textSize: string;
  compactSpacing?: boolean;
  node?: ReactMarkdownProps["node"];
}

export const MemoParagraphBlock = memo<ParagraphBlockProps>(
  ({
    children,
    textColor,
    textSize,
    compactSpacing = false,
    node: _node,
  }) => {
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
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) &&
      sameTextStyling(prev, next) &&
      prev.textSize === next.textSize &&
      prev.compactSpacing === next.compactSpacing
    );
  }
);

MemoParagraphBlock.displayName = "MemoParagraphBlock";
