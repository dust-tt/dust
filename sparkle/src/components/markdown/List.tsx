import { markdownParagraphSize } from "@sparkle/components/markdown/markdownSizes";
import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
import { cn } from "@sparkle/lib";
import { cva } from "class-variance-authority";
import React from "react";

export const ulBlockVariants = cva(["s-list-disc s-pb-2 s-pl-6"]);

export function UlBlock({ children }: { children: React.ReactNode }) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  const textSize = forcedTextSize ?? markdownParagraphSize;
  return (
    <ul className={cn(ulBlockVariants(), textColor, textSize)}>{children}</ul>
  );
}

export const olBlockVariants = cva(["s-list-decimal s-pb-2 s-pl-6"]);

export function OlBlock({
  children,
  start,
}: {
  children: React.ReactNode;
  start?: number;
}) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  const textSize = forcedTextSize ?? markdownParagraphSize;
  return (
    <ol start={start} className={cn(olBlockVariants(), textColor, textSize)}>
      {children}
    </ol>
  );
}

export const liBlockVariants = cva(["s-break-words"]);

export function LiBlock({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  const textSize = forcedTextSize ?? markdownParagraphSize;
  return (
    <li className={cn(liBlockVariants(), textColor, textSize, className)}>
      {children}
    </li>
  );
}
