import { useCallback, useState } from "react";

const LOCAL_STORAGE_KEY = "collabEnabled";

/** Whether the user wants the collab editor on Markdown files; on unless switched off. */
export function useCollabPreference() {
  const [isCollabOn, setIsCollabOnState] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    try {
      return localStorage.getItem(LOCAL_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });

  const setIsCollabOn = useCallback((isOn: boolean) => {
    setIsCollabOnState(isOn);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, isOn ? "true" : "false");
    } catch {
      // localStorage may be full or unavailable — silently ignore.
    }
  }, []);

  return { isCollabOn, setIsCollabOn };
}
