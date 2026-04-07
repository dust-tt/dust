import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import React, { memo } from "react";

interface StrongBlockProps {
  children?: React.ReactNode;
  node?: MarkdownNode;
}

export const StrongBlock = memo(
  function StrongBlock({ children }: StrongBlockProps) {
    const { textColor } = useMarkdownStyle();
    return (
      <strong className={`s-font-semibold ${textColor}`}>{children}</strong>
    );
  },
  (prev, next) => sameNodePosition(prev.node, next.node)
);
