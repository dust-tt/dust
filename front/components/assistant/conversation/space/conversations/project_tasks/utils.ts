import { removeDiacritics } from "@app/lib/utils";
import type { ProjectTaskType } from "@app/types/project_task";
import { cn } from "@dust-tt/sparkle";
import type React from "react";
import { useLayoutEffect } from "react";

export const DELETE_TASK_CONFIRM_PREVIEW_MAX_CHARS = 200;
export const NEW_MANUAL_TASK_MAX_CHARS = 256;
export const MANUAL_ADD_TASK_PLACEHOLDER = "Add a task...";

/** Tasks are visually multi-line (soft wrap) but must not contain newline characters. */
export function stripNewlines(value: string): string {
  return value.replace(/\r\n|\r|\n/g, " ");
}

/** Onboarding tasks are seeded with `agentInstructions` so a user can kick off
 * a guided first conversation; manual user-created tasks don't have them. */
export function isOnboardingTask(task: ProjectTaskType): boolean {
  return !!task.agentInstructions;
}

/** Normalizes user input for accent-insensitive, case-insensitive matching. */
export function normalizeProjectTaskSearchNeedle(raw: string): string {
  return removeDiacritics(raw.trim()).toLowerCase();
}

function projectTodoHaystackNormalized(s: string | null | undefined): string {
  return normalizeProjectTaskSearchNeedle(s ?? "");
}

/** `needle` must already be `{normalizeProjectTaskSearchNeedle}` output. Empty matches all. */
export function projectTaskMatchesLocalSearch(
  task: ProjectTaskType,
  needle: string
): boolean {
  if (needle === "") {
    return true;
  }
  if (projectTodoHaystackNormalized(task.text).includes(needle)) {
    return true;
  }
  if (
    task.user?.fullName &&
    projectTodoHaystackNormalized(task.user.fullName).includes(needle)
  ) {
    return true;
  }
  if (
    task.actorRationale?.trim() &&
    projectTodoHaystackNormalized(task.actorRationale).includes(needle)
  ) {
    return true;
  }
  for (const src of task.sources) {
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
  active: boolean
) {
  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    const el = textAreaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [active, textAreaRef]);
}

/** Hidden on `md+` until the `group/task` ancestor is hovered or focus-within. */
export const TASK_DESKTOP_HOVER_REVEAL_CLASS =
  "md:opacity-0 md:group-hover/task:opacity-100 md:focus-within:opacity-100";

export const TODO_TEXTAREA_FIELD_CLASS = cn(
  "m-0 block min-h-[1.5rem] w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent px-0 py-0 align-top text-base leading-6 text-foreground break-words",
  "shadow-none [box-shadow:none]",
  "outline-none ring-0 ring-offset-0",
  "focus:shadow-none focus:[box-shadow:none] focus:outline-none focus:ring-0 focus:ring-offset-0",
  // biome-ignore lint/plugin/noCssImportant: legacy [GEN12] — needs cleanup
  "focus:!ring-0 focus:!ring-offset-0",
  "focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
  // biome-ignore lint/plugin/noCssImportant: legacy [GEN12] — needs cleanup
  "focus-visible:!ring-0",
  "placeholder:text-muted-foreground",
  "dark:text-foreground-night dark:placeholder:text-muted-foreground-night"
);
