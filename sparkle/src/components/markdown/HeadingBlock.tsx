import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
import { markdownHeaderClasses } from "@sparkle/components/markdown/markdownSizes";
import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { cn } from "@sparkle/lib/utils";
import React, { memo } from "react";

const headingSpacing: Record<number, string> = {
  1: "s-pb-2 s-pt-4",
  2: "s-pb-2 s-pt-4",
  3: "s-pb-2 s-pt-4",
  4: "s-pb-1.5 s-pt-3",
  5: "s-pb-1 s-pt-2.5",
  6: "s-pb-1 s-pt-2.5",
};

interface HeadingBlockProps {
  children?: React.ReactNode;
  id?: string;
  node?: MarkdownNode;
}

export const H1Block = memo(
  ({ children, id }: HeadingBlockProps) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    return (
      <h1
        id={id}
        className={cn(
          headingSpacing[1],
          forcedTextSize ?? markdownHeaderClasses.h1,
          textColor
        )}
      >
        {children}
      </h1>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node) && prev.id === next.id
);
H1Block.displayName = "H1Block";

export const H2Block = memo(
  ({ children, id }: HeadingBlockProps) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    return (
      <h2
        id={id}
        className={cn(
          headingSpacing[2],
          forcedTextSize ?? markdownHeaderClasses.h2,
          textColor
        )}
      >
        {children}
      </h2>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node) && prev.id === next.id
);
H2Block.displayName = "H2Block";

export const H3Block = memo(
  ({ children, id }: HeadingBlockProps) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    return (
      <h3
        id={id}
        className={cn(
          headingSpacing[3],
          forcedTextSize ?? markdownHeaderClasses.h3,
          textColor
        )}
      >
        {children}
      </h3>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node) && prev.id === next.id
);
H3Block.displayName = "H3Block";

export const H4Block = memo(
  ({ children, id }: HeadingBlockProps) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    return (
      <h4
        id={id}
        className={cn(
          headingSpacing[4],
          forcedTextSize ?? markdownHeaderClasses.h4,
          textColor
        )}
      >
        {children}
      </h4>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node) && prev.id === next.id
);
H4Block.displayName = "H4Block";

export const H5Block = memo(
  ({ children, id }: HeadingBlockProps) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    return (
      <h5
        id={id}
        className={cn(
          headingSpacing[5],
          forcedTextSize ?? markdownHeaderClasses.h5,
          textColor
        )}
      >
        {children}
      </h5>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node) && prev.id === next.id
);
H5Block.displayName = "H5Block";

export const H6Block = memo(
  ({ children, id }: HeadingBlockProps) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    return (
      <h6
        id={id}
        className={cn(
          headingSpacing[6],
          forcedTextSize ?? markdownHeaderClasses.h6,
          textColor
        )}
      >
        {children}
      </h6>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node) && prev.id === next.id
);
H6Block.displayName = "H6Block";
