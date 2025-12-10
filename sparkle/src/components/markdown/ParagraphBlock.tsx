import { cva } from "class-variance-authority";
import React from "react";

import { cn } from "@sparkle/lib";

export const paragraphBlockVariants = cva(
  [
    "s-whitespace-pre-wrap s-break-words s-font-normal first:s-pt-0 last:s-pb-0",
    "s-py-0",
  ],
  {
    variants: {
      variant: {
        surface: ["s-py-1 @md:s-py-2 @md:s-leading-7"],
      },
    },
  }
);

interface ParagraphBlockProps {
  children: React.ReactNode;
  textColor: string;
  textSize: string;
  variant?: "surface";
}

export function ParagraphBlock({
  children,
  textColor,
  textSize,
  variant = "surface",
}: ParagraphBlockProps) {
  return (
    <div
      className={cn(paragraphBlockVariants({ variant }), textSize, textColor)}
    >
      {children}
    </div>
  );
}
