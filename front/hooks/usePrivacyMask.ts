import { useCallback, useEffect, useState } from "react";

const PRIVACY_MASK_STORAGE_KEY = "privacy-mask";
const PRIVACY_MASK_CLASS = "privacy-mask-enabled";

/**
 * Custom hook for managing privacy mask state and functionality
 */
export function usePrivacyMask() {
  const [isEnabled, setIsEnabled] = useState(false);

  // Helper functions for privacy mask management.
  const getPrivacyMaskState = useCallback((): boolean => {
    const stored = localStorage.getItem(PRIVACY_MASK_STORAGE_KEY);
    return stored === "true";
  }, []);

  const setPrivacyMaskStorage = useCallback((enabled: boolean): void => {
    localStorage.setItem(PRIVACY_MASK_STORAGE_KEY, enabled.toString());
  }, []);

  const applyPrivacyMaskToBody = useCallback((enabled: boolean): void => {
    if (enabled) {
      document.body.classList.add(PRIVACY_MASK_CLASS);
    } else {
      document.body.classList.remove(PRIVACY_MASK_CLASS);
    }
  }, []);

  // Initialize state from localStorage on mount.
  useEffect(() => {
    setIsEnabled(getPrivacyMaskState());
  }, [getPrivacyMaskState]);

  // Toggle privacy mask state.
  const toggle = useCallback(() => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    setPrivacyMaskStorage(newState);
    applyPrivacyMaskToBody(newState);
    return newState;
  }, [isEnabled, setPrivacyMaskStorage, applyPrivacyMaskToBody]);

  return {
    isEnabled,
    toggle,
  };
}
