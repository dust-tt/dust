import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
} from "react";

export const ViewChangeLockContext = createContext<
  (() => () => void) | undefined
>(undefined);

export const useViewChangeLock = (isLocked: boolean) => {
  const lockViewChange = useContext(ViewChangeLockContext);

  useLayoutEffect(() => {
    if (isLocked) {
      return lockViewChange?.();
    }
  }, [isLocked, lockViewChange]);
};

/**
 * @cc [owner:flvndvd,label:product] save-before-view-change
 * Locked views MUST NOT be replaced or closed. Blocked navigation MUST NOT trigger a save
 * or run later when the lock is released.
 */
export const useViewChangeGuard = () => {
  const lockCountRef = useRef(0);

  const lockViewChange = useCallback(() => {
    lockCountRef.current += 1;
    return () => {
      lockCountRef.current -= 1;
    };
  }, []);

  const changeView = useCallback((change: () => void) => {
    if (lockCountRef.current === 0) {
      change();
    }
  }, []);

  return { lockViewChange, changeView };
};
