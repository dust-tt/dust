import { cva } from "class-variance-authority";
import React from "react";

import { cn } from "@sparkle/lib";

export const paragraphBlockVariants = cva(
  [
    "s-whitespace-pre-wrap s-break-words s-font-normal first:s-pt-0 last:s-pb-0",
  ],
  {
    variants: {
      tightSpacing: {
        true: ["s-py-0"],
        false: ["s-py-1 @md:s-py-2 @md:s-leading-7"],
      },
    },
  }
);

interface ParagraphBlockProps {
  children: React.ReactNode;
  textColor: string;
  textSize: string;
  tightSpacing?: boolean;
}

export function ParagraphBlock({
  children,
  textColor,
  textSize,
  tightSpacing = false,
}: ParagraphBlockProps) {
  return (
    <div
      className={cn(
        paragraphBlockVariants({ tightSpacing }),
        textSize,
        textColor
      )}
    >
      {children}
    </div>
  );
}
