import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
import { markdownParagraphSize } from "@sparkle/components/markdown/markdownSizes";
import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { cn } from "@sparkle/lib";
import { cva } from "class-variance-authority";
import React, { memo } from "react";

export const ulBlockVariants = cva("pb-2 flex flex-col gap-1", {
  variants: {
    taskList: {
      false: "list-disc pl-6",
      true: "",
    },
  },
  defaultVariants: {
    taskList: false,
  },
});

interface UlBlockProps {
  children: React.ReactNode;
  className?: string;
  node?: MarkdownNode;
}

/**
 * Renders unordered lists inside Markdown output; GFM task lists (detected via
 * the `contains-task-list` class) drop the disc bullets.
 * @summary Unordered-list renderer for Markdown.
 */
export const UlBlock = memo(
  ({ children, className }: UlBlockProps) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    const textSize = forcedTextSize ?? markdownParagraphSize;
    const isTaskList = className?.includes("contains-task-list");
    return (
      <ul
        className={cn(
          ulBlockVariants({ taskList: isTaskList }),
          textColor,
          textSize,
          className
        )}
      >
        {children}
      </ul>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && prev.className === next.className
);
UlBlock.displayName = "UlBlock";

export const olBlockVariants = cva([
  "list-decimal pb-2 pl-6 flex flex-col gap-1",
]);

interface OlBlockProps {
  children: React.ReactNode;
  start?: number;
  node?: MarkdownNode;
}

/**
 * Renders ordered lists inside Markdown output, honoring the `start` number
 * from the source Markdown.
 * @summary Ordered-list renderer for Markdown.
 */
export const OlBlock = memo(
  ({ children, start }: OlBlockProps) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    const textSize = forcedTextSize ?? markdownParagraphSize;
    return (
      <ol start={start} className={cn(olBlockVariants(), textColor, textSize)}>
        {children}
      </ol>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && prev.start === next.start
);
OlBlock.displayName = "OlBlock";

export const liBlockVariants = cva(["break-words"]);

interface LiBlockProps {
  children: React.ReactNode;
  className?: string;
  node?: MarkdownNode;
}

/**
 * Renders list items inside Markdown output; task-list items (detected via the
 * `task-list-item` class) suppress their list marker.
 * @summary List-item renderer for Markdown.
 */
export const LiBlock = memo(
  ({ children, className }: LiBlockProps) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    const textSize = forcedTextSize ?? markdownParagraphSize;
    const isTaskListItem = className?.includes("task-list-item");
    return (
      <li
        className={cn(
          liBlockVariants(),
          isTaskListItem && "list-none",
          textColor,
          textSize,
          className
        )}
      >
        {children}
      </li>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) && prev.className === next.className
);
LiBlock.displayName = "LiBlock";
