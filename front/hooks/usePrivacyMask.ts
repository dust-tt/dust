import { useCallback, useEffect, useState } from "react";

const PRIVACY_MASK_COOKIE = "privacy-mask";
const PRIVACY_MASK_CLASS = "privacy-mask-enabled";

/**
 * Custom hook for managing privacy mask state and functionality
 */
export function usePrivacyMask() {
  const [isEnabled, setIsEnabled] = useState(false);

  // Helper functions
  const getPrivacyMaskState = useCallback((): boolean => {
    const cookies = document.cookie.split(";");
    const privacyCookie = cookies.find((c) =>
      c.trim().startsWith(`${PRIVACY_MASK_COOKIE}=`)
    );
    return privacyCookie ? privacyCookie.split("=")[1] === "true" : false;
  }, []);

  const setPrivacyMaskCookie = useCallback((enabled: boolean): void => {
    document.cookie = `${PRIVACY_MASK_COOKIE}=${enabled}; path=/; max-age=31536000`; // 1 year
  }, []);

  const applyPrivacyMaskToBody = useCallback((enabled: boolean): void => {
    if (enabled) {
      document.body.classList.add(PRIVACY_MASK_CLASS);
    } else {
      document.body.classList.remove(PRIVACY_MASK_CLASS);
    }
  }, []);

  // Initialize state from cookie on mount
  useEffect(() => {
    setIsEnabled(getPrivacyMaskState());
  }, [getPrivacyMaskState]);

  // Toggle privacy mask state
  const toggle = useCallback(() => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    setPrivacyMaskCookie(newState);
    applyPrivacyMaskToBody(newState);
    return newState;
  }, [isEnabled, setPrivacyMaskCookie, applyPrivacyMaskToBody]);

  return {
    isEnabled,
    toggle,
  };
}
