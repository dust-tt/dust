import { Check, cn, Icon, Spinner } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

import type { PlanTaskState } from "./planUtils";

/**
 * Plan task rows — Figma 14800:126251.
 *
 * Replaces the GFM task-list checkbox in the plan panel. A checkbox reads as
 * "something for the user to tick"; these tasks belong to the agent, so each row
 * gets a status badge instead: a numbered step that becomes a check when the
 * agent finishes it, carrying a spinner while it is the step in flight.
 *
 * Badge states and tokens, read off the frame:
 *   done      bg #E9F7FF / check  #1C91FF  ->  bg-highlight-50 / text-highlight-500
 *   running   bg #E9F7FF / number #1C91FF  ->  bg-highlight-50 / text-highlight-500 + arc
 *   upcoming  bg #E7E5E4 / number #A6A09B  ->  bg-primary-200  / text-faint
 * Done rows strike their text through in #A6A09B (text-faint).
 *
 * `blocked` is not in the frame; it is this file's extension for production's
 * `- [!]` marker, kept in the same visual language (warning tint).
 *
 * Exports are components only, so Fast Refresh keeps working — the pure helpers
 * (`planTaskStates`, `normalizePlanMarkdown`) live in `planUtils.ts`.
 */

const BADGE_STYLES: Record<PlanTaskState, string> = {
  done: "bg-highlight-50 text-highlight-500",
  running: "bg-highlight-50 text-highlight-500",
  blocked: "bg-warning-100 text-warning-600",
  upcoming: "bg-primary-200 text-faint",
};

export function PlanTaskBadge({
  state,
  number,
}: {
  state: PlanTaskState;
  number: number;
}) {
  return (
    <div
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full",
        BADGE_STYLES[state]
      )}
    >
      {state === "done" ? (
        <Icon visual={Check} size="xs" />
      ) : (
        <span className="text-base font-medium leading-none">{number}</span>
      )}
      {state === "running" && (
        // The frame draws a static ~130° arc inscribed in the 32px badge — a
        // spinner caught mid-rotation. sparkle's 32px worm spinner is that arc,
        // animated (2px stroke where the frame has 3px, plus a faint track).
        <span className="pointer-events-none absolute inset-0">
          <Spinner size="lg" variant="blue500" />
        </span>
      )}
    </div>
  );
}

/**
 * `ul` renderer: the task list is a plain column of badge rows, while ordinary
 * bullet lists elsewhere in the plan keep sparkle's default look.
 */
export function PlanMarkdownList({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const isTaskList = className?.includes("contains-task-list");
  return (
    <ul
      className={cn(
        "flex flex-col pb-2",
        isTaskList ? "list-none gap-5 pl-0" : "list-disc gap-1 pl-6"
      )}
    >
      {children}
    </ul>
  );
}

/**
 * `li` renderer. Non-task items fall through to a plain list item.
 *
 * Assumes the `## Tasks` checklist is one flat list: react-markdown's `index` is
 * the position within the parent `<ul>`, which only equals the global task index
 * while that holds.
 */
export function PlanMarkdownListItem({
  children,
  className,
  index,
  states,
}: {
  children?: ReactNode;
  className?: string;
  index: number;
  states: PlanTaskState[];
}) {
  if (!className?.includes("task-list-item")) {
    return <li className={cn("break-words", className)}>{children}</li>;
  }

  const state = states[index] ?? "upcoming";

  return (
    <li className="flex list-none items-start gap-2.5">
      <PlanTaskBadge state={state} number={index + 1} />
      {/* pt-1.5 centres the first 20px line against the 32px badge. */}
      <div
        className={cn(
          "min-w-0 flex-1 break-words pt-1.5 text-sm leading-5 tracking-[-0.28px]",
          state === "done" ? "text-faint line-through" : "text-foreground"
        )}
      >
        {children}
      </div>
    </li>
  );
}
