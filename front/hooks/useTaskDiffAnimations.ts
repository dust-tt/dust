import type { ProjectTaskType } from "@app/types/project_task";
import { useEffect, useRef, useState } from "react";

const DONE_FLASH_DURATION_MS = 1000;
const TASK_ANIMATION_LEDGER_STORAGE_KEY = "project_tasks_animation_ledger_v1";
const TASK_ANIMATION_LEDGER_MAX_KEYS = 1000;

const animatedTaskEventKeys = new Set<string>();
let hasHydratedAnimatedTaskEventKeys = false;

function hydrateAnimatedTaskEventKeysFromSessionStorage() {
  if (hasHydratedAnimatedTaskEventKeys || typeof window === "undefined") {
    return;
  }

  hasHydratedAnimatedTaskEventKeys = true;
  try {
    const raw = window.sessionStorage.getItem(
      TASK_ANIMATION_LEDGER_STORAGE_KEY
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
        animatedTaskEventKeys.add(key);
      }
    }
  } catch {
    // Best-effort cache hydration only.
  }
}

function persistAnimatedTaskEventKeysToSessionStorage() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keys = Array.from(animatedTaskEventKeys);
    const limitedKeys = keys.slice(-TASK_ANIMATION_LEDGER_MAX_KEYS);
    window.sessionStorage.setItem(
      TASK_ANIMATION_LEDGER_STORAGE_KEY,
      JSON.stringify(limitedKeys)
    );
  } catch {
    // Best-effort cache persistence only.
  }
}

function addAnimatedTaskEventKeys(keys: string[]) {
  let didChange = false;
  for (const key of keys) {
    if (!animatedTaskEventKeys.has(key)) {
      animatedTaskEventKeys.add(key);
      didChange = true;
    }
  }

  if (!didChange) {
    return;
  }

  if (animatedTaskEventKeys.size > TASK_ANIMATION_LEDGER_MAX_KEYS * 2) {
    const trimmed = Array.from(animatedTaskEventKeys).slice(
      -TASK_ANIMATION_LEDGER_MAX_KEYS
    );
    animatedTaskEventKeys.clear();
    for (const key of trimmed) {
      animatedTaskEventKeys.add(key);
    }
  }

  persistAnimatedTaskEventKeysToSessionStorage();
}

interface TaskDiffAnimationState {
  newItemKeys: Set<string>;
  doneFlashKeys: Set<string>;
}

interface UseTaskDiffAnimationsArgs {
  ledgerScopeKey: string;
  tasks: ProjectTaskType[];
  frozenLastReadAt: string | null | undefined;
  isTasksLoading: boolean;
  markRead: () => Promise<void>;
}

export function useTaskDiffAnimations({
  ledgerScopeKey,
  tasks,
  frozenLastReadAt,
  isTasksLoading,
  markRead,
}: UseTaskDiffAnimationsArgs): TaskDiffAnimationState {
  const [newItemKeys, setNewItemKeys] = useState<Set<string>>(new Set());
  const [seenNewKeys, setSeenNewKeys] = useState<Set<string>>(new Set());
  const [doneFlashKeys, setDoneFlashKeys] = useState<Set<string>>(new Set());
  const inFlightNewKeysRef = useRef<Set<string>>(new Set());
  const doneFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    hydrateAnimatedTaskEventKeysFromSessionStorage();
  }, []);

  useEffect(() => {
    if (isTasksLoading || frozenLastReadAt === undefined) {
      return;
    }

    if (frozenLastReadAt === null) {
      return;
    }

    const cutoffMs = new Date(frozenLastReadAt).getTime();
    const addedTaskIds = new Set<string>();
    const addedEventKeys: string[] = [];
    const newlyDoneTaskIds = new Set<string>();
    const newlyDoneEventKeys: string[] = [];

    for (const task of tasks) {
      const createdAtMs = new Date(task.createdAt).getTime();
      if (createdAtMs > cutoffMs) {
        const eventKey = `${ledgerScopeKey}:added:${task.sId}:${task.createdAt}`;
        if (
          !seenNewKeys.has(task.sId) &&
          !inFlightNewKeysRef.current.has(task.sId) &&
          !animatedTaskEventKeys.has(eventKey)
        ) {
          addedTaskIds.add(task.sId);
          addedEventKeys.push(eventKey);
        }
        continue;
      }

      if (task.status === "done" && task.doneAt) {
        const doneAtMs = new Date(task.doneAt).getTime();
        if (doneAtMs > cutoffMs) {
          const eventKey = `${ledgerScopeKey}:done:${task.sId}:${task.doneAt}`;
          if (!animatedTaskEventKeys.has(eventKey)) {
            newlyDoneTaskIds.add(task.sId);
            newlyDoneEventKeys.push(eventKey);
          }
        }
      }
    }

    if (addedTaskIds.size === 0 && newlyDoneTaskIds.size === 0) {
      return;
    }

    addAnimatedTaskEventKeys([...addedEventKeys, ...newlyDoneEventKeys]);

    void markRead();

    if (addedTaskIds.size > 0) {
      inFlightNewKeysRef.current = new Set([
        ...inFlightNewKeysRef.current,
        ...addedTaskIds,
      ]);
      setNewItemKeys((prev) => new Set([...prev, ...addedTaskIds]));
      setSeenNewKeys((prev) => new Set([...prev, ...addedTaskIds]));
    }

    if (newlyDoneTaskIds.size > 0) {
      setDoneFlashKeys((prev) => new Set([...prev, ...newlyDoneTaskIds]));

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
    isTasksLoading,
    ledgerScopeKey,
    markRead,
    tasks,
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
