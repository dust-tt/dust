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

interface UlBlockProps {
  children: React.ReactNode;
  node?: MarkdownNode;
}

export const UlBlock = memo(
  ({ children }: UlBlockProps) => {
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

interface OlBlockProps {
  children: React.ReactNode;
  start?: number;
  node?: MarkdownNode;
}

export const OlBlock = memo(
  ({ children, start }: OlBlockProps) => {
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

interface LiBlockProps {
  children: React.ReactNode;
  className?: string;
  node?: MarkdownNode;
}

export const LiBlock = memo(
  ({ children, className }: LiBlockProps) => {
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
