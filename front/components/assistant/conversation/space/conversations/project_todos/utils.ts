import { removeDiacritics } from "@app/lib/utils";
import type { ProjectTodoType } from "@app/types/project_todo";
import { cn } from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useLayoutEffect } from "react";

export const SUMMARY_ITEM_TRANSITION_MS = 240;
export const DELETE_TODO_CONFIRM_PREVIEW_MAX_CHARS = 200;
export const NEW_MANUAL_TODO_MAX_CHARS = 256;
export const MANUAL_ADD_TODO_PLACEHOLDER = "Add a to-do...";

/** To-dos are visually multi-line (soft wrap) but must not contain newline characters. */
export function stripNewlines(value: string): string {
  return value.replace(/\r\n|\r|\n/g, " ");
}

/** Onboarding to-dos are seeded with `agentInstructions` so a user can kick off
 * a guided first conversation; manual user-created to-dos don't have them. */
export function isOnboardingTodo(todo: ProjectTodoType): boolean {
  return !!todo.agentInstructions;
}

/** Normalizes user input for accent-insensitive, case-insensitive matching. */
export function normalizeProjectTodoSearchNeedle(raw: string): string {
  return removeDiacritics(raw.trim()).toLowerCase();
}

function projectTodoHaystackNormalized(s: string | null | undefined): string {
  return normalizeProjectTodoSearchNeedle(s ?? "");
}

/** `needle` must already be `{normalizeProjectTodoSearchNeedle}` output. Empty matches all. */
export function projectTodoMatchesLocalSearch(
  todo: ProjectTodoType,
  needle: string
): boolean {
  if (needle === "") {
    return true;
  }
  if (projectTodoHaystackNormalized(todo.text).includes(needle)) {
    return true;
  }
  if (
    todo.user?.fullName &&
    projectTodoHaystackNormalized(todo.user.fullName).includes(needle)
  ) {
    return true;
  }
  if (
    todo.actorRationale?.trim() &&
    projectTodoHaystackNormalized(todo.actorRationale).includes(needle)
  ) {
    return true;
  }
  for (const src of todo.sources) {
    if (
      src.sourceTitle?.trim() &&
      projectTodoHaystackNormalized(src.sourceTitle).includes(needle)
    ) {
      return true;
    }
  }
  return false;
}

export function useAutosizeTextArea(
  textAreaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  active: boolean
) {
  const adjustHeight = useCallback(() => {
    const el = textAreaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [textAreaRef]);

  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    adjustHeight();
  }, [active, adjustHeight]);
}

/** Indents standalone rows (e.g. add block) to match `ProjectTodosDataTable` todo rows. */
export const PROJECT_TODO_TABLE_ROW_INSET_CLASS = "pl-4 pr-0";

/** Outer frame for the manual-add row (avatar · input · action). */
export const PROJECT_TODO_ITEM_ROW_FRAME_CLASS =
  "flex w-full min-w-0 items-center gap-3 rounded-md px-1 py-1";

/**
 * Manual-add gutter width: matches todo rows (`Checkbox` / leading icon = `size-4`)
 * so the input lines up under task text.
 */
export const PROJECT_TODO_MANUAL_ADD_LEADING_CLASS =
  "relative h-[2.375rem] w-4 shrink-0 flex-none overflow-visible";

/** Centers `size-7` assignee control in the narrow gutter without affecting layout width */
export const PROJECT_TODO_MANUAL_ADD_LEADING_ASSIGNEE_ANCHOR_CLASS =
  "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 shrink-0";

/** Invisible spacer in the checkbox / sparkles column when that column is unused. */
export const PROJECT_TODO_LEADING_GUTTER_CLASS =
  "mt-0.5 flex size-4 shrink-0 items-center justify-center";

/** Manual-add trailing actions: hugs the input (`w-auto`); height `2.375rem` matches shell. */
export const PROJECT_TODO_EDIT_ACTION_CLUSTER_CLASS =
  "flex h-[2.375rem] w-auto shrink-0 flex-none items-center justify-start gap-1";

/** Single-line field inside the manual-add shell (paired with TODO_TEXTAREA styling). */
export const MANUAL_ADD_TODO_INPUT_FIELD_CLASS = cn(
  "m-0 block h-[1.5rem] w-full min-w-0 border-0 bg-transparent px-0 py-0 align-middle text-base leading-6 text-foreground",
  "shadow-none [box-shadow:none]",
  "outline-none ring-0 ring-offset-0",
  "focus:shadow-none focus:[box-shadow:none] focus:outline-none focus:ring-0 focus:ring-offset-0",
  "focus:!ring-0 focus:!ring-offset-0",
  "focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
  "focus-visible:!ring-0",
  "placeholder:text-muted-foreground",
  "dark:text-foreground-night dark:placeholder:text-muted-foreground-night"
);

export const TODO_TEXTAREA_FIELD_CLASS = cn(
  "m-0 block min-h-[1.5rem] w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent px-0 py-0 align-top text-base leading-6 text-foreground break-words",
  "shadow-none [box-shadow:none]",
  "outline-none ring-0 ring-offset-0",
  "focus:shadow-none focus:[box-shadow:none] focus:outline-none focus:ring-0 focus:ring-offset-0",
  "focus:!ring-0 focus:!ring-offset-0",
  "focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
  "focus-visible:!ring-0",
  "placeholder:text-muted-foreground",
  "dark:text-foreground-night dark:placeholder:text-muted-foreground-night"
);
