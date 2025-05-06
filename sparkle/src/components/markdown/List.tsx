import { cva } from "class-variance-authority";
import React from "react";

import { cn } from "@sparkle/lib";

export const ulBlockVariants = cva(["s-list-disc s-pb-2 s-pl-6"]);

interface UlBlockProps {
  children: React.ReactNode;
  textColor: string;
  textSize: string;
}

export function UlBlock({ children, textColor, textSize }: UlBlockProps) {
  return (
    <ul className={cn(ulBlockVariants(), textColor, textSize)}>{children}</ul>
  );
}

export const olBlockVariants = cva(["s-list-decimal s-pb-2 s-pl-6"]);

interface OlBlockProps {
  children: React.ReactNode;
  start?: number;
  textColor: string;
  textSize: string;
}

export function OlBlock({
  children,
  start,
  textColor,
  textSize,
}: OlBlockProps) {
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
  textColor: string;
  textSize: string;
}

export function LiBlock({
  children,
  className,
  textColor,
  textSize,
}: LiBlockProps) {
  return (
    <li className={cn(liBlockVariants(), textColor, textSize, className)}>
      {children}
    </li>
  );
}
