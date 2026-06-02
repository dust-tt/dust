import { useSyncExternalStore } from "react";

/**
 * Minimal pub/sub value container shared by the poke client-side stores: the persisted
 * favorites array (`persistentArrayStore`) and the in-memory current-page metadata
 * (`currentPage`). It only holds a single snapshot and notifies subscribers on change;
 * persistence and cross-tab sync are layered on top by callers.
 */
export interface ExternalStore<T> {
  getSnapshot: () => T;
  setSnapshot: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createExternalStore<T>(initial: T): ExternalStore<T> {
  let snapshot = initial;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    setSnapshot: (value: T) => {
      if (value === snapshot) {
        return;
      }
      snapshot = value;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** React binding for an `ExternalStore`, kept in sync via `useSyncExternalStore`. */
export function useExternalStore<T>(
  store: ExternalStore<T>,
  getServerSnapshot: () => T
): T {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    getServerSnapshot
  );
}
