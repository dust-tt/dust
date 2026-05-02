import { cn } from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useLayoutEffect } from "react";

export const SUMMARY_ITEM_TRANSITION_MS = 240;
export const DELETE_TODO_CONFIRM_PREVIEW_MAX_CHARS = 200;
export const NEW_MANUAL_TODO_MAX_CHARS = 256;

/** To-dos are visually multi-line (soft wrap) but must not contain newline characters. */
export function stripNewlines(value: string): string {
  return value.replace(/\r\n|\r|\n/g, " ");
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

export const ADD_TODO_BAR_SHELL_CLASS = cn(
  "flex min-h-9 w-full min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-1.5 py-0 shadow-sm",
  "dark:border-border-night/60 dark:bg-background-night/50"
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
