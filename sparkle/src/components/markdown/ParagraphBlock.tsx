import React from "react";

import { cn } from "@sparkle/lib";

export const paragraphBlockVariants = {
  base: cn(
    "s-whitespace-pre-wrap s-break-words s-font-normal first:s-pt-0 last:s-pb-0",
    "s-py-1 @md:s-py-2 @md:s-leading-7"
  ),
};

interface ParagraphBlockProps {
  children: React.ReactNode;
  textColor: string;
  textSize: string;
}

export function ParagraphBlock({
  children,
  textColor,
  textSize,
}: ParagraphBlockProps) {
  return (
    <div className={cn(paragraphBlockVariants.base, textSize, textColor)}>
      {children}
    </div>
  );
}
