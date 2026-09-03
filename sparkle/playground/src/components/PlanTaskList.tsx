import { Check, cn, Icon, XClose } from "@dust-tt/sparkle";
import type { CSSProperties, ReactNode } from "react";
import { Children, isValidElement, useEffect, useState } from "react";

import {
  type PlanTaskState,
  splitTaskLead,
  TASK_CHECK_MS,
  TASK_STRIKE_MS,
} from "./planUtils";

/**
 * Plan task rows — Figma 14800:126251.
 *
 * Replaces the GFM task-list checkbox in the plan panel. A checkbox reads as
 * "something for the user to tick"; these tasks belong to the agent, so each row
 * gets a status badge instead: a numbered step that becomes a check when the
 * agent finishes it, carrying a spinner while it is the step in flight.
 *
 * Badge states and tokens, read off the frames:
 *   done      bg #E9F7FF / check  #1C91FF      ->  bg-highlight-50 / text-highlight-500
 *   running   no fill    / number #1C91FF      ->  text-highlight-500 + arc
 *   upcoming  outline + number #A6A09B     ->  border-faint / text-faint
 * Row text is two-tone (15076:36759): the bold lead and its ` — ` separator sit
 * at `text-foreground`, the description at `text-muted-foreground`. A done row
 * is `text-faint` throughout, struck through.
 *
 * Upcoming is an outline rather than a fill (15067:36683), which also separates
 * it from `blocked` — the only grey-filled badge now. That frame labels the
 * colour `primary/primary-muted`, but its value is the #A6A09B every other frame
 * in the file calls `muted/faint`; sparkle's `primary-muted` is stone-500 and
 * would read a step darker, so `faint` is the value match.
 *
 * Its border is drawn at 0.714px in the frame — a 1px border on a 28px badge
 * scaled to 20px — so it is a plain 1px here. The running arc is 1px too, on the
 * same radius, so the ring does not move when a task starts.
 *
 * Sizing follows Figma 15072:36729: a 20px badge with a small number, an 8px
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

function revealStyle(delayMs: number): RevealStyle {
  return {
    "--tw-animation-delay": `${delayMs}ms`,
    "--tw-animation-duration": `${REVEAL_MS}ms`,
  };
}

/**
 * How a row earns its entrance.
 *
 * - `stagger`: the whole list is being shown at once, so rows are offset by
 *   index to arrive in sequence.
 * - `arrival`: the plan is streaming in, so a row animates the moment it mounts
 *   — the append cadence already spaces them out and an index offset would
 *   double up on it.
 * - `none`: no animation, for a list that is simply already there.
 */
export type TaskRevealMode = "stagger" | "arrival" | "none";

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
  // Running has no fill: the blue number and the arc carry it.
  running: "text-highlight-500",
  // Blocked is grey rather than a warning tint, and drops the number for a
  // cross: the step is terminal, not pending.
  blocked: "bg-primary-200 text-muted-foreground",
  // Not started yet: a grey outline, no fill — Figma 15067:36683.
  upcoming: "border border-faint text-faint",
};

export function PlanTaskBadge({
  state,
  number,
  isDrawingCheck = false,
}: {
  state: PlanTaskState;
  number: number;
  /** Draws the check in, for the task that has just completed. */
  isDrawingCheck?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex size-5 shrink-0 items-center justify-center rounded-full",
        BADGE_STYLES[state]
      )}
    >
      {/* 11px, a step under the 12px number: a glyph that fills its box reads
          larger than a digit of the same nominal size. Also closer to the
          frame's 11.429px. */}
      {state === "done" && (
        // `Icon` takes no style, so the animation rides on a wrapper.
        <span
          className={cn("inline-flex", isDrawingCheck && "animate-task-wipe")}
          style={
            isDrawingCheck
              ? { animationDuration: `${TASK_CHECK_MS}ms` }
              : undefined
          }
        >
          <Icon visual={Check} size="xs" className="size-[11px]" />
        </span>
      )}
      {state === "blocked" && (
        <Icon visual={XClose} size="xs" className="size-[11px]" />
      )}
      {(state === "running" || state === "upcoming") && (
        <span className="text-xs font-medium leading-none">{number}</span>
      )}
      {state === "running" && (
        // A ~130° arc sweeping the badge's edge, as the frame draws it.
        //
        // Hand-rolled rather than sparkle's spinner: that renders a 2px stroke
        // at every size, so no amount of scaling gives the 1px that matches
        // `upcoming`'s outline — scaling it thinner drags the radius in with it.
        // Here r=9.5 with a 1px stroke puts the arc exactly where that outline
        // sits (spanning 9 to 10 of the 20px badge), so the two are the same
        // ring. `pathLength` normalises the dash to percentages, as sparkle's
        // own spinner does: 36% of the circumference is ~130°.
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-spin motion-reduce:animate-none"
        >
          <circle
            cx="10"
            cy="10"
            r="9.5"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray="36 64"
          />
        </svg>
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
  revealMode = "none",
  justCompletedIndex = null,
}: {
  children?: ReactNode;
  className?: string;
  index: number;
  states: PlanTaskState[];
  /** How the row animates in, if at all. */
  revealMode?: TaskRevealMode;
  /**
   * The task that has just this moment completed, if any. Only that row plays
   * the completion beats — otherwise every already-done row would replay them on
   * each `edit_plan`, since the Markdown tree remounts per edit.
   */
  justCompletedIndex?: number | null;
}) {
  if (!className?.includes("task-list-item")) {
    return <li className={cn("break-words", className)}>{children}</li>;
  }

  return (
    <TaskRow
      index={index}
      state={states[index] ?? "upcoming"}
      revealMode={revealMode}
      isCompleting={index === justCompletedIndex}
    >
      {children}
    </TaskRow>
  );
}

/**
 * Advances a character cursor from 0 to `length` once `active` turns on, after
 * `delayMs`. The strike has to travel in reading order — line one, then line
 * two — and CSS cannot address wrapped line boxes, so it is driven per character
 * from here rather than by a clip.
 */
function useStrikeCursor(
  length: number,
  active: boolean,
  durationMs: number,
  delayMs: number
) {
  const [cursor, setCursor] = useState(length);

  useEffect(() => {
    if (!active) {
      setCursor(length);
      return;
    }

    setCursor(0);
    let frame = 0;
    let startedAt = 0;

    const step = (now: number) => {
      if (!startedAt) {
        startedAt = now;
      }
      const elapsed = now - startedAt - delayMs;
      if (elapsed < 0) {
        frame = requestAnimationFrame(step);
        return;
      }
      const progress = Math.min(1, elapsed / durationMs);
      setCursor(Math.round(progress * length));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, length, durationMs, delayMs]);

  return cursor;
}

/**
 * One run of the row's text, struck up to `cursor` (an offset into the whole
 * row, hence `from`). The full run is always rendered so the line breaks never
 * move — only the decoration advances.
 */
function StruckRun({
  text,
  from,
  cursor,
  className,
}: {
  text: string;
  from: number;
  cursor: number;
  className?: string;
}) {
  const local = Math.max(0, Math.min(text.length, cursor - from));

  if (local <= 0) {
    return <span className={className}>{text}</span>;
  }
  if (local >= text.length) {
    return <span className={cn(className, "line-through")}>{text}</span>;
  }
  return (
    <span className={className}>
      <span className="line-through">{text.slice(0, local)}</span>
      {text.slice(local)}
    </span>
  );
}

function TaskRow({
  children,
  index,
  state,
  revealMode,
  isCompleting,
}: {
  children?: ReactNode;
  index: number;
  state: PlanTaskState;
  revealMode: TaskRevealMode;
  isCompleting: boolean;
}) {
  const plainText = taskPlainText(children);
  const lead = plainText ? splitTaskLead(plainText) : null;
  const isDone = state === "done";
  const isStriking = isDone && isCompleting;

  const total = lead
    ? lead.lead.length + lead.separator.length + lead.rest.length
    : 0;
  const animatedCursor = useStrikeCursor(
    total,
    isStriking,
    TASK_STRIKE_MS,
    TASK_CHECK_MS
  );
  // Rows already done when the panel opens are struck in full, with no replay.
  const cursor = isDone ? animatedCursor : 0;

  const isRevealing = revealMode !== "none";
  const revealDelayMs = revealMode === "stagger" ? index * STAGGER_MS : 0;

  return (
    <li
      className={cn(
        "flex list-none items-start gap-2",
        // Rows rise into place. `animate-in` reads its delay and duration from
        // the --tw-animation-* custom properties below (an inline
        // `animationDelay` would lose to the shorthand), and fill-mode-backwards
        // holds the row at opacity 0 until its turn comes.
        isRevealing &&
          "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-enter"
      )}
      style={isRevealing ? revealStyle(revealDelayMs) : undefined}
    >
      <PlanTaskBadge
        state={state}
        number={index + 1}
        isDrawingCheck={isStriking}
      />
      <div
        className={cn(
          "copy-sm min-w-0 flex-1 break-words transition-colors duration-300",
          isDone ? "text-faint" : "text-foreground"
        )}
        // Hold the fade to faint until the check has finished drawing, so the
        // two beats do not overlap.
        style={
          isStriking ? { transitionDelay: `${TASK_CHECK_MS}ms` } : undefined
        }
      >
        {lead ? (
          // Figma 15076:36759: the lead and its separator stay at foreground,
          // the description drops to muted-foreground. A done row goes faint
          // throughout (15072:36729), so it leaves those colours off and
          // inherits.
          <>
            <StruckRun
              text={lead.lead}
              from={0}
              cursor={cursor}
              className="heading-sm"
            />
            <StruckRun
              text={lead.separator}
              from={lead.lead.length}
              cursor={cursor}
            />
            <StruckRun
              text={lead.rest}
              from={lead.lead.length + lead.separator.length}
              cursor={cursor}
              className={cn(!isDone && "text-muted-foreground")}
            />
          </>
        ) : (
          // Richer inline markdown: no character cursor, so it strikes at once.
          <span className={cn(isDone && "line-through")}>{children}</span>
        )}
      </div>
    </li>
  );
}
