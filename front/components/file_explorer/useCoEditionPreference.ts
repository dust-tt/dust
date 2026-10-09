import { useCallback, useState } from "react";

const LOCAL_STORAGE_KEY = "coEditionEnabled";

/** Whether the user wants the Co-edition editor on Markdown files; on unless switched off. */
export function useCoEditionPreference() {
  const [isCoEditionOn, setIsCoEditionOnState] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    try {
      return localStorage.getItem(LOCAL_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });

  const setIsCoEditionOn = useCallback((isOn: boolean) => {
    setIsCoEditionOnState(isOn);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, isOn ? "true" : "false");
    } catch {
      // localStorage may be full or unavailable — silently ignore.
    }
  }, []);

  return { isCoEditionOn, setIsCoEditionOn };
}
