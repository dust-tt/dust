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

export const UlBlock = memo(
  ({ children, textColor, textSize }: UlBlockProps) => {
    return (
      <ul className={cn(ulBlockVariants(), textColor, textSize)}>{children}</ul>
    );
  },
  (prevProps, nextProps) =>
    sameNodePosition(prevProps.node, nextProps.node) &&
    sameTextStyling(prevProps, nextProps)
);

export const olBlockVariants = cva(["s-list-decimal s-pb-2 s-pl-6"]);

interface OlBlockProps {
  children: React.ReactNode;
  start?: number;
  textColor: string;
  textSize: string;
  node?: MarkdownNode;
}

export const OlBlock = memo(
  ({ children, start, textColor, textSize }: OlBlockProps) => {
    return (
      <ol start={start} className={cn(olBlockVariants(), textColor, textSize)}>
        {children}
      </ol>
    );
  },
  (prevProps, nextProps) =>
    sameNodePosition(prevProps.node, nextProps.node) &&
    prevProps.start === nextProps.start &&
    sameTextStyling(prevProps, nextProps)
);

export const liBlockVariants = cva(["s-break-words"]);

interface LiBlockProps {
  children: React.ReactNode;
  className?: string;
  textColor: string;
  textSize: string;
  node?: MarkdownNode;
}

export const LiBlock = memo(
  ({ children, className, textColor, textSize }: LiBlockProps) => {
    return (
      <li className={cn(liBlockVariants(), textColor, textSize, className)}>
        {children}
      </li>
    );
  },
  (prevProps, nextProps) =>
    sameNodePosition(prevProps.node, nextProps.node) &&
    prevProps.className === nextProps.className &&
    sameTextStyling(prevProps, nextProps)
);
