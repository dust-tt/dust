import { Icon } from "@sparkle/components/Icon";
import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
import { markdownParagraphSize } from "@sparkle/components/markdown/markdownSizes";
import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { Check } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib";
import { cva } from "class-variance-authority";
import React, { createContext, memo, useContext } from "react";

// Ordered lists share their `start` so step badges can number task items.
const OlStartContext = createContext(1);

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

export const olBlockVariants = cva("pb-2 flex flex-col gap-1", {
  variants: {
    taskSteps: {
      false: "list-decimal pl-6",
      true: "",
    },
  },
  defaultVariants: {
    taskSteps: false,
  },
});

interface OlBlockProps {
  children: React.ReactNode;
  className?: string;
  start?: number;
  node?: MarkdownNode;
}

/**
 * Renders ordered lists inside Markdown output, honoring the `start` number
 * from the source Markdown. Task lists in the "step" variant drop the decimal
 * markers since the badges carry the numbers.
 * @summary Ordered-list renderer for Markdown.
 */
export const OlBlock = memo(
  ({ children, className, start }: OlBlockProps) => {
    const { textColor, forcedTextSize, taskListVariant } = useMarkdownStyle();
    const textSize = forcedTextSize ?? markdownParagraphSize;
    const isTaskSteps =
      taskListVariant === "step" && className?.includes("contains-task-list");
    return (
      <OlStartContext.Provider value={start ?? 1}>
        <ol
          start={start}
          className={cn(
            olBlockVariants({ taskSteps: isTaskSteps }),
            textColor,
            textSize,
            className
          )}
        >
          {children}
        </ol>
      </OlStartContext.Provider>
    );
  },
  (prev, next) =>
    sameNodePosition(prev.node, next.node) &&
    prev.start === next.start &&
    prev.className === next.className
);
OlBlock.displayName = "OlBlock";

// mt-[3px] centers the 20px badge on the 26px leading-relaxed text line.
const taskStepBadgeVariants = cva(
  "mt-[3px] flex size-5 shrink-0 items-center justify-center rounded-full",
  {
    variants: {
      checked: {
        true: "bg-highlight-50 text-highlight-500",
        false: "border border-faint text-faint",
      },
    },
  }
);

interface TaskStepBadgeProps {
  checked: boolean;
  number?: number;
}

function taskStepLabel({ checked, number }: TaskStepBadgeProps) {
  if (checked) {
    return "Done";
  }
  return number !== undefined ? `Step ${number}` : "To do";
}

function TaskStepBadge({ checked, number }: TaskStepBadgeProps) {
  return (
    <div
      role="img"
      aria-label={taskStepLabel({ checked, number })}
      className={taskStepBadgeVariants({ checked })}
    >
      {checked ? (
        <Icon visual={Check} size="2xs" />
      ) : (
        number !== undefined && (
          <span className="text-xs font-medium leading-none">{number}</span>
        )
      )}
    </div>
  );
}

export const liBlockVariants = cva(["break-words"]);

interface LiBlockProps {
  children: React.ReactNode;
  className?: string;
  checked?: boolean | null;
  index?: number;
  ordered?: boolean;
  node?: MarkdownNode;
}

/**
 * Renders list items inside Markdown output; task-list items (detected via the
 * `task-list-item` class) suppress their list marker. In the "step" task-list
 * variant they get a read-only circle badge instead of a checkbox.
 * @summary List-item renderer for Markdown.
 */
export const LiBlock = memo(
  ({ children, className, checked, index, ordered }: LiBlockProps) => {
    const { textColor, forcedTextSize, taskListVariant } = useMarkdownStyle();
    const start = useContext(OlStartContext);
    const textSize = forcedTextSize ?? markdownParagraphSize;
    const isTaskListItem = className?.includes("task-list-item");

    if (isTaskListItem && taskListVariant === "step") {
      const isChecked = checked === true;
      return (
        <li
          className={cn(
            liBlockVariants(),
            "flex list-none items-start gap-2",
            textColor,
            textSize,
            className
          )}
        >
          <TaskStepBadge
            checked={isChecked}
            number={ordered && index !== undefined ? start + index : undefined}
          />
          <div
            className={cn(
              "min-w-0 flex-1",
              isChecked && "text-faint line-through"
            )}
          >
            {children}
          </div>
        </li>
      );
    }

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
    sameNodePosition(prev.node, next.node) &&
    prev.className === next.className &&
    prev.checked === next.checked &&
    prev.index === next.index &&
    prev.ordered === next.ordered
);
LiBlock.displayName = "LiBlock";
