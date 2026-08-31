import { useCallback, useEffect, useState } from "react";

const AGENTS_SECTION_VISIBILITY_STORAGE_KEY = "agentsSectionVisible";
const AGENTS_SECTION_VISIBILITY_EVENT = "agentsSectionVisibilityChange";

function readAgentsSectionVisibility(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  const stored = window.localStorage.getItem(
    AGENTS_SECTION_VISIBILITY_STORAGE_KEY
  );
  return stored !== "false";
}

export function setAgentsSectionVisibility(visible: boolean) {
  window.localStorage.setItem(
    AGENTS_SECTION_VISIBILITY_STORAGE_KEY,
    String(visible)
  );
  window.dispatchEvent(new Event(AGENTS_SECTION_VISIBILITY_EVENT));
}

export function useAgentsSectionVisibility() {
  const [isAgentsSectionVisible, setIsAgentsSectionVisible] = useState(
    readAgentsSectionVisibility
  );

  useEffect(() => {
    const handleChange = () => {
      setIsAgentsSectionVisible(readAgentsSectionVisibility());
    };
    window.addEventListener(AGENTS_SECTION_VISIBILITY_EVENT, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      window.removeEventListener(AGENTS_SECTION_VISIBILITY_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  const updateAgentsSectionVisibility = useCallback((visible: boolean) => {
    setAgentsSectionVisibility(visible);
    setIsAgentsSectionVisible(visible);
  }, []);

  return {
    isAgentsSectionVisible,
    setAgentsSectionVisible: updateAgentsSectionVisibility,
  };
}
