import { useMemo } from "react";

export interface SlashTriggerState {
  isActive: boolean;
  triggerIndex: number;
  query: string;
}

const INACTIVE: SlashTriggerState = {
  isActive: false,
  triggerIndex: -1,
  query: "",
};

const MAX_QUERY_LENGTH = 60;

/**
 * Derives the active "/" trigger (if any) purely from the current text and
 * caret position, on every call — there is no separate "are we in slash
 * mode" flag to keep in sync. This is what makes backspace behave correctly
 * for free: deleting the "/" (or moving the caret away from it) simply
 * changes what this function returns next render, instead of requiring a
 * manual close.
 */
export function useSlashTrigger(
  value: string,
  selectionStart: number | null
): SlashTriggerState {
  return useMemo(() => {
    if (selectionStart === null) {
      return INACTIVE;
    }

    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const lineUpToCaret = value.slice(lineStart, selectionStart);
    const slashIndexInLine = lineUpToCaret.lastIndexOf("/");

    if (slashIndexInLine === -1) {
      return INACTIVE;
    }

    const triggerIndex = lineStart + slashIndexInLine;
    const charBefore = triggerIndex === 0 ? "" : value[triggerIndex - 1];
    const isValidStart = charBefore === "" || /\s/.test(charBefore);
    if (!isValidStart) {
      return INACTIVE;
    }

    const query = value.slice(triggerIndex + 1, selectionStart);
    // A space typed straight after the "/" means the user wanted a literal
    // slash, not a command: the trigger releases and the "/" is left behind
    // as an ordinary character. Deleting the space brings the menu back,
    // same as any other edit that reshapes the trigger.
    if (/^\s/.test(query)) {
      return INACTIVE;
    }
    if (/\s{2,}/.test(query) || query.length > MAX_QUERY_LENGTH) {
      return INACTIVE;
    }

    return { isActive: true, triggerIndex, query };
  }, [value, selectionStart]);
}
