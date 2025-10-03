import { cva } from "class-variance-authority";
import React, { memo } from "react";

import { cn } from "@sparkle/lib";

import { sameNodePosition, sameTextStyling } from "./utils";

type MarkdownPoint = { line?: number; column?: number };
type MarkdownPosition = { start?: MarkdownPoint; end?: MarkdownPoint };
type MarkdownNode = {
  position?: MarkdownPosition;
};

export const ulBlockVariants = cva(["s-list-disc s-pb-2 s-pl-6"]);

interface UlBlockProps {
  children: React.ReactNode;
  textColor: string;
  textSize: string;
  node?: MarkdownNode;
}

export const MemoUlBlock = memo(
  ({ children, textColor, textSize }: UlBlockProps) => {
    return (
      <ul className={cn(ulBlockVariants(), textColor, textSize)}>{children}</ul>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
);

MemoUlBlock.displayName = "UlBlock";

export const olBlockVariants = cva(["s-list-decimal s-pb-2 s-pl-6"]);

interface OlBlockProps {
  children: React.ReactNode;
  start?: number;
  textColor: string;
  textSize: string;
  node?: MarkdownNode;
}

export const MemoOlBlock = memo(
  ({ children, start, textColor, textSize }: OlBlockProps) => {
    return (
      <ol start={start} className={cn(olBlockVariants(), textColor, textSize)}>
        {children}
      </ol>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) &&
    prev.start === next.start &&
    sameTextStyling(prev, next)
);

MemoOlBlock.displayName = "OlBlock";

export const liBlockVariants = cva(["s-break-words"]);

interface LiBlockProps {
  children: React.ReactNode;
  className?: string;
  textColor: string;
  textSize: string;
  node?: MarkdownNode;
}

export const MemoLiBlock = memo(
  ({ children, className, textColor, textSize }: LiBlockProps) => {
    return (
      <li className={cn(liBlockVariants(), textColor, textSize, className)}>
        {children}
      </li>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) &&
    prev.className === next.className &&
    sameTextStyling(prev, next)
);

MemoLiBlock.displayName = "LiBlock";
