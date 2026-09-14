import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import React, { memo } from "react";

interface HrBlockProps {
  node?: MarkdownNode;
}

/**
 * Renders thematic breaks (`---`) inside Markdown output as a horizontal
 * divider line.
 * @summary Horizontal-rule renderer for Markdown.
 */
export const HrBlock = memo(
  (_props: HrBlockProps) => (
    <div className="my-4 border-b border-primary-150" />
  ),
  (prev, next) => sameNodePosition(prev.node, next.node)
);
HrBlock.displayName = "HrBlock";
