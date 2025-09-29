import React, { memo } from "react";

import { cn } from "@sparkle/lib/utils";

import { MarkdownNode } from "./types";
import { sameNodePosition, sameTextStyling } from "./utils";

export const markdownHeaderClasses = {
  h1: "s-heading-2xl",
  h2: "s-heading-xl",
  h3: "s-heading-lg",
  h4: "s-text-base s-font-semibold",
  h5: "s-text-sm s-font-semibold",
  h6: "s-text-sm s-font-regular s-italic",
};

interface HeaderBlockProps {
  children: React.ReactNode;
  textColor?: string;
  forcedTextSize?: string;
  node?: MarkdownNode;
}

export const MemoH1Block = memo(
  ({ children, textColor, forcedTextSize }: HeaderBlockProps) => {
    return (
      <h1
        className={cn(
          "s-pb-2 s-pt-4",
          forcedTextSize ? forcedTextSize : markdownHeaderClasses.h1,
          textColor
        )}
      >
        {children}
      </h1>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
    );
  }
);

MemoH1Block.displayName = "H1Block";

export const MemoH2Block = memo(
  ({ children, textColor, forcedTextSize }: HeaderBlockProps) => {
    return (
      <h2
        className={cn(
          "s-pb-2 s-pt-4",
          forcedTextSize ? forcedTextSize : markdownHeaderClasses.h2,
          textColor
        )}
      >
        {children}
      </h2>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
    );
  }
);

MemoH2Block.displayName = "H2Block";

export const MemoH3Block = memo(
  ({ children, textColor, forcedTextSize }: HeaderBlockProps) => {
    return (
      <h3
        className={cn(
          "s-pb-2 s-pt-4",
          forcedTextSize ? forcedTextSize : markdownHeaderClasses.h3,
          textColor
        )}
      >
        {children}
      </h3>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
    );
  }
);

MemoH3Block.displayName = "H3Block";

export const MemoH4Block = memo(
  ({ children, textColor, forcedTextSize }: HeaderBlockProps) => {
    return (
      <h4
        className={cn(
          "s-pb-2 s-pt-3",
          forcedTextSize ? forcedTextSize : markdownHeaderClasses.h4,
          textColor
        )}
      >
        {children}
      </h4>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
    );
  }
);

MemoH4Block.displayName = "H4Block";

export const MemoH5Block = memo(
  ({ children, textColor, forcedTextSize }: HeaderBlockProps) => {
    return (
      <h5
        className={cn(
          "s-pb-1.5 s-pt-2.5",
          forcedTextSize ? forcedTextSize : markdownHeaderClasses.h5,
          textColor
        )}
      >
        {children}
      </h5>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
    );
  }
);

MemoH5Block.displayName = "H5Block";

export const MemoH6Block = memo(
  ({ children, textColor, forcedTextSize }: HeaderBlockProps) => {
    return (
      <h6
        className={cn(
          "s-pb-1.5 s-pt-2.5",
          forcedTextSize ? forcedTextSize : markdownHeaderClasses.h6,
          textColor
        )}
      >
        {children}
      </h6>
    );
  },
  (prev, next) => {
    return (
      sameNodePosition(prev.node, next.node) && sameTextStyling(prev, next)
    );
  }
);

MemoH6Block.displayName = "H6Block";
