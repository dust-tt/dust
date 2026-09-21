import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
} from "react";

type BeforeViewChange = () => Promise<boolean>;

export const BeforeViewChangeContext = createContext<
  ((callback: BeforeViewChange) => () => void) | undefined
>(undefined);

export const useBeforeViewChange = (callback: BeforeViewChange) => {
  const register = useContext(BeforeViewChangeContext);
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useLayoutEffect(() => register?.(() => callbackRef.current()), [register]);
};

/**
 * @cc [owner:flvndvd,label:product] save-before-view-change
 * Registered views MUST finish saving before they can be replaced or closed.
 * Failed saves MUST leave the view open. A stale save MUST NOT navigate a replacement view.
 */
export const useViewChangeGuard = () => {
  const beforeChangeRef = useRef<BeforeViewChange | null>(null);
  const changingRef = useRef(false);

  const registerBeforeChange = useCallback((callback: BeforeViewChange) => {
    beforeChangeRef.current = callback;
    return () => {
      if (beforeChangeRef.current === callback) {
        beforeChangeRef.current = null;
      }
    };
  }, []);

  const changeView = useCallback((change: () => void) => {
    const beforeChange = beforeChangeRef.current;
    if (!beforeChange) {
      change();
      return;
    }
    if (changingRef.current) {
      return;
    }

    changingRef.current = true;
    void beforeChange()
      .then((canLeave) => {
        if (canLeave && beforeChangeRef.current === beforeChange) {
          change();
        }
      })
      .finally(() => {
        changingRef.current = false;
      });
  }, []);

  return { registerBeforeChange, changeView };
};
