import {
  stripNewlines,
  useAutosizeTextArea,
} from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import type { PodTaskType } from "@app/types/project_task";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

const BLUR_COMMIT_DELAY_MS = 150;

interface UseTaskInlineEditArgs {
  task: PodTaskType;
  canEdit: boolean;
  onCommitText: (text: string) => Promise<void>;
}

export function useTaskInlineEdit({
  task,
  canEdit,
  onCommitText,
}: UseTaskInlineEditArgs) {
  const [isEditing, setIsEditing] = useState(false);
  const [showSavedPulse, setShowSavedPulse] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committingRef = useRef(false);
  const clickOffsetRef = useRef<number | null>(null);

  useAutosizeTextArea(inputRef, isEditing);

  useEffect(
    () => () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
      }
    },
    []
  );

  const cancel = () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setIsEditing(false);
  };

  const commit = async () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    if (committingRef.current || !isEditing) {
      return;
    }
    const trimmed = stripNewlines(inputRef.current?.value ?? "").trim();
    if (!trimmed) {
      cancel();
      return;
    }
    if (trimmed === stripNewlines(task.text)) {
      setIsEditing(false);
      return;
    }
    committingRef.current = true;
    try {
      await onCommitText(trimmed);
      setIsEditing(false);
      setShowSavedPulse(true);
    } finally {
      committingRef.current = false;
    }
  };

  const startEdit = (charOffset?: number) => {
    if (!canEdit) {
      return;
    }
    clickOffsetRef.current = charOffset ?? null;
    setIsEditing(true);
  };

  return {
    isEditing,
    inputRef,
    showSavedPulse,
    startEdit,
    dismissSavedPulse: () => setShowSavedPulse(false),
    textareaHandlers: {
      onFocus: () => {
        if (blurTimerRef.current) {
          clearTimeout(blurTimerRef.current);
          blurTimerRef.current = null;
        }
        const offset = clickOffsetRef.current;
        const el = inputRef.current;
        if (offset !== null && el) {
          const pos = Math.min(offset, el.value.length);
          el.setSelectionRange(pos, pos);
          clickOffsetRef.current = null;
        }
      },
      onBlur: () => {
        blurTimerRef.current = setTimeout(() => {
          void commit();
        }, BLUR_COMMIT_DELAY_MS);
      },
      onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
        }
      },
    },
  };
}
