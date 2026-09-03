import { Check, cn, Icon, Spinner, XClose } from "@dust-tt/sparkle";
import type { CSSProperties, ReactNode } from "react";
import { Children, isValidElement } from "react";

import { type PlanTaskState, splitTaskLead } from "./planUtils";

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
 * Sizing follows Figma 14918:28388: a 20px badge with a small number, a 10px
 * gap, and rows top-aligned with no nudge — a 20px badge against a 20px
 * line-height centres the first line on its own. Type is `copy-sm` with a
 * `heading-sm` lead, which are 14/20/-0.28 at weights 400 and 550: exactly the
 * frame's values.
 *
 * `blocked` is not in the frame; it is this file's extension for production's
 * `- [!]` marker: grey, with a cross in place of the number.
 *
 * Rows also lead with a bold run taken from the start of their own text (see
 * `splitTaskLead`) and stagger in when the plan is first shown.
 *
 * Exports are components only, so Fast Refresh keeps working — the pure helpers
 * (`planTaskStates`, `normalizePlanMarkdown`) live in `planUtils.ts`.
 */

/** Per-row offset for the staggered reveal, and each row's own fade duration. */
const STAGGER_MS = 70;
const REVEAL_MS = 280;

/**
 * `CSSProperties` does not model custom properties, so declare the two this row
 * sets rather than casting the object.
 */
interface RevealStyle extends CSSProperties {
  "--tw-animation-delay": string;
  "--tw-animation-duration": string;
}

function revealStyle(index: number): RevealStyle {
  return {
    "--tw-animation-delay": `${index * STAGGER_MS}ms`,
    "--tw-animation-duration": `${REVEAL_MS}ms`,
  };
}

/**
 * The task's text as a plain string, or null when the row holds richer inline
 * markdown (bold, code, a link) — in that case the row renders its children
 * untouched rather than risk dropping formatting for the sake of a bold lead.
 *
 * The checkbox element is skipped: it is still in `children`, rendering null.
 */
function isCheckbox(node: ReactNode): boolean {
  return (
    isValidElement<{ type?: string }>(node) && node.props.type === "checkbox"
  );
}

function taskPlainText(children: ReactNode): string | null {
  let text = "";

  for (const node of Children.toArray(children)) {
    if (typeof node === "string" || typeof node === "number") {
      text += String(node);
      continue;
    }
    if (isCheckbox(node)) {
      continue;
    }
    return null;
  }

  return text;
}

const BADGE_STYLES: Record<PlanTaskState, string> = {
  done: "bg-highlight-50 text-highlight-500",
  running: "bg-highlight-50 text-highlight-500",
  // Blocked is grey rather than a warning tint, and drops the number for a
  // cross: the step is terminal, not pending. A slightly stronger grey than
  // `upcoming`'s number so the two do not read as the same state.
  blocked: "bg-primary-200 text-muted-foreground",
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
        "relative flex size-5 shrink-0 items-center justify-center rounded-full",
        BADGE_STYLES[state]
      )}
    >
      {state === "done" && (
        <Icon visual={Check} size="xs" className="h-3 w-3" />
      )}
      {state === "blocked" && (
        <Icon visual={XClose} size="xs" className="h-3 w-3" />
      )}
      {(state === "running" || state === "upcoming") && (
        <span className="text-xs font-medium leading-none">{number}</span>
      )}
      {state === "running" && (
        // The frame draws a static ~130° arc on the badge — a spinner caught
        // mid-rotation. sparkle's worm spinner is that arc, animated.
        //
        // Its ring is `r="9"` in a 24 viewBox, so the 24px `md` spinner puts the
        // centerline at radius 9 — inside the badge's 10px radius. The flex
        // centring lines the 24px SVG up on the 20px badge, then scaling by
        // 10/9 lands the centerline exactly on the badge's border. The stroke
        // scales with it (2px -> 2.2px) and straddles the edge.
        <span className="pointer-events-none absolute inset-0 flex scale-[1.1111] items-center justify-center">
          <Spinner size="md" variant="blue500" />
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
  isRevealing = false,
}: {
  children?: ReactNode;
  className?: string;
  index: number;
  states: PlanTaskState[];
  /** Staggers the row in when the plan is first shown. */
  isRevealing?: boolean;
}) {
  if (!className?.includes("task-list-item")) {
    return <li className={cn("break-words", className)}>{children}</li>;
  }

  const state = states[index] ?? "upcoming";
  const plainText = taskPlainText(children);
  const lead = plainText ? splitTaskLead(plainText) : null;

  return (
    <li
      className={cn(
        "flex list-none items-start gap-2.5",
        // Rows arrive one after the other. `animate-in` reads its delay and
        // duration from the --tw-animation-* custom properties below (an inline
        // `animationDelay` would lose to the shorthand), and fill-mode-backwards
        // holds the row at opacity 0 until its turn comes.
        isRevealing &&
          "animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards ease-enter"
      )}
      style={isRevealing ? revealStyle(index) : undefined}
    >
      <PlanTaskBadge state={state} number={index + 1} />
      <div
        className={cn(
          "copy-sm min-w-0 flex-1 break-words",
          state === "done" ? "text-faint line-through" : "text-foreground"
        )}
      >
        {lead ? (
          <>
            <span className="heading-sm">{lead.lead}</span>
            {lead.rest}
          </>
        ) : (
          children
        )}
      </div>
    </li>
  );
}
