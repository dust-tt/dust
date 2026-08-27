import { useCallback, useEffect, useState } from "react";

const CHAT_WITH_VISIBILITY_STORAGE_KEY = "chatWithSectionVisible";
const CHAT_WITH_VISIBILITY_EVENT = "chatWithSectionVisibilityChange";

function readChatWithVisibility(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  const stored = window.localStorage.getItem(CHAT_WITH_VISIBILITY_STORAGE_KEY);
  return stored !== "false";
}

export function setChatWithVisibility(visible: boolean) {
  window.localStorage.setItem(
    CHAT_WITH_VISIBILITY_STORAGE_KEY,
    String(visible)
  );
  window.dispatchEvent(new Event(CHAT_WITH_VISIBILITY_EVENT));
}

export function useChatWithVisibility() {
  const [isChatWithVisible, setIsChatWithVisible] = useState(
    readChatWithVisibility
  );

  useEffect(() => {
    const handleChange = () => {
      setIsChatWithVisible(readChatWithVisibility());
    };
    window.addEventListener(CHAT_WITH_VISIBILITY_EVENT, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener(CHAT_WITH_VISIBILITY_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  const updateChatWithVisibility = useCallback((visible: boolean) => {
    setChatWithVisibility(visible);
    setIsChatWithVisible(visible);
  }, []);

  return { isChatWithVisible, setChatWithVisible: updateChatWithVisibility };
}
