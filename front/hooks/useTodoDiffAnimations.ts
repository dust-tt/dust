import type { ProjectTodoType } from "@app/types/project_todo";
import { useEffect, useRef, useState } from "react";

const SUMMARY_ITEM_TRANSITION_MS = 240;
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
  pendingAddedKeys: Set<string>;
  enteringKeys: Set<string>;
  typingKeys: Set<string>;
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
  const [pendingAddedKeys, setPendingAddedKeys] = useState<Set<string>>(
    new Set()
  );
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(new Set());
  const [enteredKeys, setEnteredKeys] = useState<Set<string>>(new Set());
  const [typingKeys, setTypingKeys] = useState<Set<string>>(new Set());
  const [doneFlashKeys, setDoneFlashKeys] = useState<Set<string>>(new Set());
  const startRaf1Ref = useRef<number | null>(null);
  const startRaf2Ref = useRef<number | null>(null);
  const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightAddedKeysRef = useRef<Set<string>>(new Set());

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
          !enteredKeys.has(todo.sId) &&
          !inFlightAddedKeysRef.current.has(todo.sId) &&
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

    // Persist immediately so refocus/remount doesn't replay the same events.
    addAnimatedTodoEventKeys([...addedEventKeys, ...newlyDoneEventKeys]);

    // Mark read immediately so navigating away/back during animation
    // doesn't cause the same items to re-animate on next mount.
    void markRead();

    if (addedTodoIds.size > 0) {
      // Keep these keys marked in-flight until cleanup completes; clearing them
      // early lets focus/revalidation passes replay "added" enter animations.
      inFlightAddedKeysRef.current = new Set(addedTodoIds);
      setPendingAddedKeys(new Set(addedTodoIds));
      setTypingKeys(new Set(addedTodoIds));
    }
    setDoneFlashKeys((prev) => new Set([...prev, ...newlyDoneTodoIds]));

    // If a revalidation triggers another pass while an animation is in-flight,
    // reschedule from the latest keys instead of letting React's effect cleanup
    // cancel the previous run and leave items collapsed.
    if (startRaf1Ref.current !== null) {
      cancelAnimationFrame(startRaf1Ref.current);
      startRaf1Ref.current = null;
    }
    if (startRaf2Ref.current !== null) {
      cancelAnimationFrame(startRaf2Ref.current);
      startRaf2Ref.current = null;
    }
    if (cleanupTimeoutRef.current !== null) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }

    // Double-RAF: wait for the browser to paint the initial hidden state of
    // new items (isAdded && !isEntering -> max-h-0 opacity-0) before triggering
    // the entering animation. setTimeout(0) could fire before the first paint,
    // causing items to flash visible before animating in.
    startRaf1Ref.current = requestAnimationFrame(() => {
      startRaf2Ref.current = requestAnimationFrame(() => {
        setEnteringKeys(new Set(addedTodoIds));
        startRaf1Ref.current = null;
        startRaf2Ref.current = null;
      });
    });

    cleanupTimeoutRef.current = setTimeout(() => {
      setEnteringKeys(new Set());
      setPendingAddedKeys(new Set());
      setEnteredKeys((prev) => new Set([...prev, ...addedTodoIds]));
      inFlightAddedKeysRef.current = new Set();
      cleanupTimeoutRef.current = null;
    }, SUMMARY_ITEM_TRANSITION_MS);
  }, [
    frozenLastReadAt,
    isTodosLoading,
    ledgerScopeKey,
    markRead,
    todos,
    enteredKeys,
  ]);

  // Cleanup only on unmount.
  useEffect(() => {
    return () => {
      const hadInFlightAnimation = inFlightAddedKeysRef.current.size > 0;

      if (startRaf1Ref.current !== null) {
        cancelAnimationFrame(startRaf1Ref.current);
      }
      if (startRaf2Ref.current !== null) {
        cancelAnimationFrame(startRaf2Ref.current);
      }
      if (cleanupTimeoutRef.current !== null) {
        clearTimeout(cleanupTimeoutRef.current);
      }
      inFlightAddedKeysRef.current = new Set();

      // If the user navigates away before the animation cleanup timeout runs,
      // persist the read marker so the same items don't re-animate on remount.
      if (hadInFlightAnimation) {
        void markRead();
      }
    };
  }, [markRead]);

  return { pendingAddedKeys, enteringKeys, typingKeys, doneFlashKeys };
}
