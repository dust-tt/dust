import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
import { markdownHeaderClasses } from "@sparkle/components/markdown/markdownSizes";
import { cn } from "@sparkle/lib/utils";
import React from "react";

const headingSpacing: Record<number, string> = {
  1: "s-pb-2 s-pt-4",
  2: "s-pb-2 s-pt-4",
  3: "s-pb-2 s-pt-4",
  4: "s-pb-2 s-pt-3",
  5: "s-pb-1.5 s-pt-2.5",
  6: "s-pb-1.5 s-pt-2.5",
};

interface HeadingBlockProps {
  children?: React.ReactNode;
}

export function H1Block({ children }: HeadingBlockProps) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  return (
    <h1
      className={cn(
        headingSpacing[1],
        forcedTextSize ?? markdownHeaderClasses.h1,
        textColor
      )}
    >
      {children}
    </h1>
  );
}

export function H2Block({ children }: HeadingBlockProps) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  return (
    <h2
      className={cn(
        headingSpacing[2],
        forcedTextSize ?? markdownHeaderClasses.h2,
        textColor
      )}
    >
      {children}
    </h2>
  );
}

export function H3Block({ children }: HeadingBlockProps) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  return (
    <h3
      className={cn(
        headingSpacing[3],
        forcedTextSize ?? markdownHeaderClasses.h3,
        textColor
      )}
    >
      {children}
    </h3>
  );
}

export function H4Block({ children }: HeadingBlockProps) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  return (
    <h4
      className={cn(
        headingSpacing[4],
        forcedTextSize ?? markdownHeaderClasses.h4,
        textColor
      )}
    >
      {children}
    </h4>
  );
}

export function H5Block({ children }: HeadingBlockProps) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  return (
    <h5
      className={cn(
        headingSpacing[5],
        forcedTextSize ?? markdownHeaderClasses.h5,
        textColor
      )}
    >
      {children}
    </h5>
  );
}

export function H6Block({ children }: HeadingBlockProps) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  return (
    <h6
      className={cn(
        headingSpacing[6],
        forcedTextSize ?? markdownHeaderClasses.h6,
        textColor
      )}
    >
      {children}
    </h6>
  );
}
