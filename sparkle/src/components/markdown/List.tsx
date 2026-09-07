import { Icon } from "@sparkle/components/Icon";
import { useMarkdownStyle } from "@sparkle/components/markdown/MarkdownStyleContext";
import { markdownParagraphSize } from "@sparkle/components/markdown/markdownSizes";
import {
  type MarkdownNode,
  sameNodePosition,
} from "@sparkle/components/markdown/utils";
import { Check } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib";
import { assertNever } from "@sparkle/lib/utils";
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

// remark-gfm marks lists holding task items with the `contains-task-list` class. react-markdown
// gives list items a `checked` prop, but the list element itself only carries this class.
function isTaskList(className?: string) {
  return className?.includes("contains-task-list") ?? false;
}

/**
 * Renders unordered lists inside Markdown output; GitHub Flavored Markdown
 * task lists drop the disc bullets.
 * @summary Unordered-list renderer for Markdown.
 */
export const UlBlock = memo(
  ({ children, className }: UlBlockProps) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    const textSize = forcedTextSize ?? markdownParagraphSize;
    return (
      <ul
        className={cn(
          ulBlockVariants({ taskList: isTaskList(className) }),
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
    taskList: {
      false: "list-decimal pl-6",
      true: "",
    },
  },
  defaultVariants: {
    taskList: false,
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
 * from the source Markdown; task lists drop the decimal markers and indent,
 * like UlBlock does for bullets.
 * @summary Ordered-list renderer for Markdown.
 */
export const OlBlock = memo(
  ({ children, className, start }: OlBlockProps) => {
    const { textColor, forcedTextSize } = useMarkdownStyle();
    const textSize = forcedTextSize ?? markdownParagraphSize;
    return (
      <OlStartContext.Provider value={start ?? 1}>
        <ol
          start={start}
          className={cn(
            olBlockVariants({ taskList: isTaskList(className) }),
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

// mt-[3px] centers the 20px badge on the 26px leading-relaxed text line. The border stays on
// both states so ticking a task only transitions colors.
const taskStepBadgeVariants = cva(
  cn(
    "mt-[3px] flex size-5 shrink-0 items-center justify-center rounded-full border",
    "transition-colors duration-300 motion-reduce:transition-none"
  ),
  {
    variants: {
      checked: {
        true: "border-highlight-50 bg-highlight-50 text-highlight-500",
        false: "border-faint text-faint",
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
        <Icon
          visual={Check}
          size="2xs"
          className="animate-in fade-in zoom-in-50 duration-300 motion-reduce:animate-none"
        />
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
 * Renders list items inside Markdown output; task-list items (react-markdown
 * passes them a boolean `checked`) suppress their list marker. In the "step"
 * task-list variant they get a read-only circle badge instead of a checkbox.
 * @summary List-item renderer for Markdown.
 */
export const LiBlock = memo(
  ({ children, className, checked, index, ordered }: LiBlockProps) => {
    const { textColor, forcedTextSize, taskListVariant } = useMarkdownStyle();
    const start = useContext(OlStartContext);
    const textSize = forcedTextSize ?? markdownParagraphSize;
    const isTaskListItem = typeof checked === "boolean";

    if (isTaskListItem) {
      switch (taskListVariant) {
        case "step":
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
                checked={checked}
                number={
                  ordered && index !== undefined ? start + index : undefined
                }
              />
              <div
                className={cn(
                  "min-w-0 flex-1 transition-colors duration-300 motion-reduce:transition-none",
                  checked && "text-faint line-through"
                )}
              >
                {children}
              </div>
            </li>
          );
        case "checkbox":
          break;
        default:
          assertNever(taskListVariant);
      }
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
