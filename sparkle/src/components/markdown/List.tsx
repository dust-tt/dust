import React from "react";

import { cn } from "@sparkle/lib";

export const ulBlockVariants = {
  base: "s-list-disc s-py-2 s-pl-8 first:s-pt-0 last:s-pb-0",
};

interface UlBlockProps {
  children: React.ReactNode;
  textColor: string;
  textSize: string;
}

export function UlBlock({ children, textColor, textSize }: UlBlockProps) {
  return (
    <ul className={cn(ulBlockVariants.base, textColor, textSize)}>
      {children}
    </ul>
  );
}

export const olBlockVariants = {
  base: "s-list-decimal s-py-3 s-pl-8 first:s-pt-0 last:s-pb-0",
};

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
    <ol start={start} className={cn(olBlockVariants.base, textColor, textSize)}>
      {children}
    </ol>
  );
}

export const liBlockVariants = {
  base: "s-break-words first:s-pt-0 last:s-pb-0 s-py-1 @md:s-py-2",
};

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
    <li className={cn(liBlockVariants.base, textColor, textSize, className)}>
      {children}
    </li>
  );
}
