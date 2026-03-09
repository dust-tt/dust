import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
import { markdownParagraphSize } from "@sparkle/components/markdown/markdownSizes";
import { cn } from "@sparkle/lib";
import { cva } from "class-variance-authority";
import React from "react";

export const ulBlockVariants = cva(["s-list-disc s-pb-2 s-pl-6"]);

interface UlBlockProps {
  children: React.ReactNode;
}

export function UlBlock({ children }: UlBlockProps) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  const textSize = forcedTextSize ?? markdownParagraphSize;
  return (
    <ul className={cn(ulBlockVariants(), textColor, textSize)}>{children}</ul>
  );
}

export const olBlockVariants = cva(["s-list-decimal s-pb-2 s-pl-6"]);

interface OlBlockProps {
  children: React.ReactNode;
  start?: number;
}

export function OlBlock({
  children,
  start,
}: OlBlockProps) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  const textSize = forcedTextSize ?? markdownParagraphSize;
  return (
    <ol start={start} className={cn(olBlockVariants(), textColor, textSize)}>
      {children}
    </ol>
  );
}

export const liBlockVariants = cva(["s-break-words"]);

interface LiBlockProps {
  children: React.ReactNode;
  className?: string;
}

export function LiBlock({
  children,
  className,
}: LiBlockProps) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  const textSize = forcedTextSize ?? markdownParagraphSize;
  return (
    <li className={cn(liBlockVariants(), textColor, textSize, className)}>
      {children}
    </li>
  );
}
