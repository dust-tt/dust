import { cva } from "class-variance-authority";
import React, { memo } from "react";
import type { ReactMarkdownProps } from "react-markdown/lib/ast-to-react";

import {
  sameNodePosition,
  sameTextStyling,
} from "@sparkle/components/markdownWithStreamingAnimation/utils";
import { cn } from "@sparkle/lib";

export const ulBlockVariants = cva(["s-list-disc s-pb-2 s-pl-6"]);

interface UlBlockProps extends Omit<ReactMarkdownProps, "children" | "node"> {
  children: React.ReactNode;
  textColor: string;
  textSize: string;
  node?: ReactMarkdownProps["node"];
}

export const MemoUlBlock = memo<UlBlockProps>(
  ({ children, textColor, textSize, node: _node }) => {
    return (
      <ul className={cn(ulBlockVariants(), textColor, textSize)}>{children}</ul>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) &&
      sameTextStyling(prev, next) &&
      prev.textSize === next.textSize
    );
  }
);

MemoUlBlock.displayName = "MemoUlBlock";

export const olBlockVariants = cva(["s-list-decimal s-pb-2 s-pl-6"]);

interface OlBlockProps extends Omit<ReactMarkdownProps, "children" | "node"> {
  children: React.ReactNode;
  start?: number;
  textColor: string;
  textSize: string;
  node?: ReactMarkdownProps["node"];
}

export const MemoOlBlock = memo<OlBlockProps>(
  ({ children, start, textColor, textSize, node: _node }) => {
    return (
      <ol start={start} className={cn(olBlockVariants(), textColor, textSize)}>
        {children}
      </ol>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) &&
      sameTextStyling(prev, next) &&
      prev.textSize === next.textSize &&
      prev.start === next.start
    );
  }
);

MemoOlBlock.displayName = "MemoOlBlock";

export const liBlockVariants = cva(["s-break-words"]);

interface LiBlockProps extends Omit<ReactMarkdownProps, "children" | "node"> {
  children: React.ReactNode;
  className?: string;
  textColor: string;
  textSize: string;
  node?: ReactMarkdownProps["node"];
}

export const MemoLiBlock = memo<LiBlockProps>(
  ({ children, className, textColor, textSize, node: _node }) => {
    return (
      <li className={cn(liBlockVariants(), textColor, textSize, className)}>
        {children}
      </li>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) &&
      sameTextStyling(prev, next) &&
      prev.textSize === next.textSize &&
      prev.className === next.className
    );
  }
);

MemoLiBlock.displayName = "MemoLiBlock";
