import { markdownHeaderClasses } from "@sparkle/components/markdown/markdownSizes";
import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
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

function HeadingBlock({
  level,
  children,
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: React.ReactNode;
}) {
  const { textColor, forcedTextSize } = useMarkdownStyle();
  const Tag = `h${level}` as const;
  const defaultSize =
    markdownHeaderClasses[`h${level}` as keyof typeof markdownHeaderClasses];
  return (
    <Tag
      className={cn(headingSpacing[level], forcedTextSize ?? defaultSize, textColor)}
    >
      {children}
    </Tag>
  );
}

// Module-level stable references — these never change identity.
export const H1Block = ({ children }: { children?: React.ReactNode }) => (
  <HeadingBlock level={1}>{children}</HeadingBlock>
);
export const H2Block = ({ children }: { children?: React.ReactNode }) => (
  <HeadingBlock level={2}>{children}</HeadingBlock>
);
export const H3Block = ({ children }: { children?: React.ReactNode }) => (
  <HeadingBlock level={3}>{children}</HeadingBlock>
);
export const H4Block = ({ children }: { children?: React.ReactNode }) => (
  <HeadingBlock level={4}>{children}</HeadingBlock>
);
export const H5Block = ({ children }: { children?: React.ReactNode }) => (
  <HeadingBlock level={5}>{children}</HeadingBlock>
);
export const H6Block = ({ children }: { children?: React.ReactNode }) => (
  <HeadingBlock level={6}>{children}</HeadingBlock>
);
