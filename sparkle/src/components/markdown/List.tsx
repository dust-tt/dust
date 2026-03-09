import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
import { markdownParagraphSize } from "@sparkle/components/markdown/markdownSizes";
import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { cn } from "@sparkle/lib";
import { cva } from "class-variance-authority";
import React, { memo } from "react";

export const ulBlockVariants = cva(["s-list-disc s-pb-2 s-pl-6"]);

export const UlBlock = memo(
  ({ children }: { children: React.ReactNode; node?: MarkdownNode }) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    const textSize = forcedTextSize ?? markdownParagraphSize;
    return (
      <ul className={cn(ulBlockVariants(), textColor, textSize)}>{children}</ul>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);
UlBlock.displayName = "UlBlock";

export const olBlockVariants = cva(["s-list-decimal s-pb-2 s-pl-6"]);

export const OlBlock = memo(
  ({
    children,
    start,
  }: {
    children: React.ReactNode;
    start?: number;
    node?: MarkdownNode;
  }) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    const textSize = forcedTextSize ?? markdownParagraphSize;
    return (
      <ol start={start} className={cn(olBlockVariants(), textColor, textSize)}>
        {children}
      </ol>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && prev.start === next.start
);
OlBlock.displayName = "OlBlock";

export const liBlockVariants = cva(["s-break-words"]);

export const LiBlock = memo(
  ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
    node?: MarkdownNode;
  }) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    const textSize = forcedTextSize ?? markdownParagraphSize;
    return (
      <li className={cn(liBlockVariants(), textColor, textSize, className)}>
        {children}
      </li>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && prev.className === next.className
);
LiBlock.displayName = "LiBlock";
