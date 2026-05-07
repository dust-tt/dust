import { stripNewlines } from "@app/components/assistant/conversation/space/conversations/project_tasks/utils";
import type { ProjectTaskType } from "@app/types/project_task";
import type { KeyboardEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

const BLUR_COMMIT_DELAY_MS = 150;

interface UseTaskInlineEditArgs {
  task: ProjectTaskType;
  canEdit: boolean;
  onCommitText: (text: string) => Promise<void>;
}

interface TaskInlineEditApi {
  isEditing: boolean;
  draftText: string;
  inputRef: RefObject<HTMLTextAreaElement>;
  showSavedPulse: boolean;
  setDraftText: (value: string) => void;
  startEdit: (charOffset?: number) => void;
  dismissSavedPulse: () => void;
  textareaHandlers: {
    onFocus: () => void;
    onBlur: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  };
}

export function useTaskInlineEdit({
  task,
  canEdit,
  onCommitText,
}: UseTaskInlineEditArgs): TaskInlineEditApi {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftTextState] = useState(() =>
    stripNewlines(task.text)
  );
  const [showSavedPulse, setShowSavedPulse] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const committingRef = useRef(false);
  const clickOffsetRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraftTextState(stripNewlines(task.text));
    }
  }, [isEditing, task.text]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    queueMicrotask(() => {
      const el = inputRef.current;
      if (!el) {
        return;
      }
      el.focus();
      const offset = clickOffsetRef.current;
      if (offset !== null) {
        const pos = Math.min(offset, el.value.length);
        el.selectionStart = pos;
        el.selectionEnd = pos;
        clickOffsetRef.current = null;
      }
    });
  }, [isEditing]);

  useEffect(
    () => () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
      }
    },
    []
  );

  const setDraftText = (value: string) => {
    setDraftTextState(stripNewlines(value));
  };

  const cancel = () => {
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setDraftTextState(stripNewlines(task.text));
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
    const trimmed = stripNewlines(draftText).trim();
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

  const dismissSavedPulse = () => setShowSavedPulse(false);

  const textareaHandlers = {
    onFocus: () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current);
        blurTimerRef.current = null;
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
  };

  return {
    isEditing,
    draftText,
    inputRef,
    showSavedPulse,
    setDraftText,
    startEdit,
    dismissSavedPulse,
    textareaHandlers,
  };
}
