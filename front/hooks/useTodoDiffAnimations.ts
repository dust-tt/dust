import type { ProjectTodoType } from "@app/types/project_todo";
import { useEffect, useRef, useState } from "react";

const DONE_FLASH_DURATION_MS = 1000;
const TODO_ANIMATION_LEDGER_STORAGE_KEY = "project_todos_animation_ledger_v1";
const TODO_ANIMATION_LEDGER_MAX_KEYS = 1000;

const animatedTodoEventKeys = new Set<string>();
let hasHydratedAnimatedTodoEventKeys = false;

function hydrateAnimatedTodoEventKeysFromSessionStorage() {
  if (hasHydratedAnimatedTodoEventKeys || typeof window === "undefined") {
    return;
  }

  hasHydratedAnimatedTodoEventKeys = true;
  try {
    const raw = window.sessionStorage.getItem(
      TODO_ANIMATION_LEDGER_STORAGE_KEY
    );
    if (!raw) {
      return;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return;
    }

    for (const key of parsed) {
      if (typeof key === "string") {
        animatedTodoEventKeys.add(key);
      }
    }
  } catch {
    // Best-effort cache hydration only.
  }
}

function persistAnimatedTodoEventKeysToSessionStorage() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keys = Array.from(animatedTodoEventKeys);
    const limitedKeys = keys.slice(-TODO_ANIMATION_LEDGER_MAX_KEYS);
    window.sessionStorage.setItem(
      TODO_ANIMATION_LEDGER_STORAGE_KEY,
      JSON.stringify(limitedKeys)
    );
  } catch {
    // Best-effort cache persistence only.
  }
}

function addAnimatedTodoEventKeys(keys: Iterable<string>) {
  let didChange = false;
  for (const key of keys) {
    if (!animatedTodoEventKeys.has(key)) {
      animatedTodoEventKeys.add(key);
      didChange = true;
    }
  }

  if (!didChange) {
    return;
  }

  if (animatedTodoEventKeys.size > TODO_ANIMATION_LEDGER_MAX_KEYS * 2) {
    const trimmed = Array.from(animatedTodoEventKeys).slice(
      -TODO_ANIMATION_LEDGER_MAX_KEYS
    );
    animatedTodoEventKeys.clear();
    for (const key of trimmed) {
      animatedTodoEventKeys.add(key);
    }
  }

  persistAnimatedTodoEventKeysToSessionStorage();
}

interface TodoDiffAnimationState {
  newItemKeys: Set<string>;
  doneFlashKeys: Set<string>;
}

interface UseTodoDiffAnimationsArgs {
  ledgerScopeKey: string;
  todos: ProjectTodoType[];
  frozenLastReadAt: string | null | undefined;
  isTodosLoading: boolean;
  markRead: () => Promise<void>;
}

export function useTodoDiffAnimations({
  ledgerScopeKey,
  todos,
  frozenLastReadAt,
  isTodosLoading,
  markRead,
}: UseTodoDiffAnimationsArgs): TodoDiffAnimationState {
  const [newItemKeys, setNewItemKeys] = useState<Set<string>>(new Set());
  const [seenNewKeys, setSeenNewKeys] = useState<Set<string>>(new Set());
  const [doneFlashKeys, setDoneFlashKeys] = useState<Set<string>>(new Set());
  const inFlightNewKeysRef = useRef<Set<string>>(new Set());
  const doneFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    hydrateAnimatedTodoEventKeysFromSessionStorage();
  }, []);

  useEffect(() => {
    if (isTodosLoading || frozenLastReadAt === undefined) {
      return;
    }

    if (frozenLastReadAt === null) {
      return;
    }

    const cutoffMs = new Date(frozenLastReadAt).getTime();
    const addedTodoIds = new Set<string>();
    const addedEventKeys: string[] = [];
    const newlyDoneTodoIds = new Set<string>();
    const newlyDoneEventKeys: string[] = [];

    for (const todo of todos) {
      const createdAtMs = new Date(todo.createdAt).getTime();
      if (createdAtMs > cutoffMs) {
        const eventKey = `${ledgerScopeKey}:added:${todo.sId}:${todo.createdAt}`;
        if (
          !seenNewKeys.has(todo.sId) &&
          !inFlightNewKeysRef.current.has(todo.sId) &&
          !animatedTodoEventKeys.has(eventKey)
        ) {
          addedTodoIds.add(todo.sId);
          addedEventKeys.push(eventKey);
        }
        continue;
      }

      if (todo.status === "done" && todo.doneAt) {
        const doneAtMs = new Date(todo.doneAt).getTime();
        if (doneAtMs > cutoffMs) {
          const eventKey = `${ledgerScopeKey}:done:${todo.sId}:${todo.doneAt}`;
          if (!animatedTodoEventKeys.has(eventKey)) {
            newlyDoneTodoIds.add(todo.sId);
            newlyDoneEventKeys.push(eventKey);
          }
        }
      }
    }

    if (addedTodoIds.size === 0 && newlyDoneTodoIds.size === 0) {
      return;
    }

    addAnimatedTodoEventKeys([...addedEventKeys, ...newlyDoneEventKeys]);

    void markRead();

    if (addedTodoIds.size > 0) {
      inFlightNewKeysRef.current = new Set([
        ...inFlightNewKeysRef.current,
        ...addedTodoIds,
      ]);
      setNewItemKeys((prev) => new Set([...prev, ...addedTodoIds]));
      setSeenNewKeys((prev) => new Set([...prev, ...addedTodoIds]));
    }

    if (newlyDoneTodoIds.size > 0) {
      setDoneFlashKeys((prev) => new Set([...prev, ...newlyDoneTodoIds]));

      if (doneFlashTimeoutRef.current !== null) {
        clearTimeout(doneFlashTimeoutRef.current);
      }
      doneFlashTimeoutRef.current = setTimeout(() => {
        setDoneFlashKeys(new Set());
        doneFlashTimeoutRef.current = null;
      }, DONE_FLASH_DURATION_MS);
    }
  }, [
    frozenLastReadAt,
    isTodosLoading,
    ledgerScopeKey,
    markRead,
    todos,
    seenNewKeys,
  ]);

  useEffect(() => {
    return () => {
      if (doneFlashTimeoutRef.current !== null) {
        clearTimeout(doneFlashTimeoutRef.current);
      }

      if (inFlightNewKeysRef.current.size > 0) {
        void markRead();
      }
    };
  }, [markRead]);

  return { newItemKeys, doneFlashKeys };
}
