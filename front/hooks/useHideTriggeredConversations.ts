import { useCallback, useState } from "react";

const LOCAL_STORAGE_KEY = "hideTriggeredConversations";

export const useHideTriggeredConversations = () => {
  const [hideTriggeredConversations, setHideState] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return localStorage.getItem(LOCAL_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const setHideTriggeredConversations = useCallback((hide: boolean) => {
    setHideState(hide);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, hide ? "true" : "false");
    } catch {
      // localStorage may be full or unavailable — silently ignore.
    }
  }, []);

  return {
    hideTriggeredConversations,
    setHideTriggeredConversations,
  };
};
