import {
  DEV_MODE_ACTIVE,
  DEV_MODE_STORAGE_KEY,
} from "@app/components/dev/devModeConstants";
import { useCallback } from "react";

export function useDevMode() {
  const toggle = useCallback(() => {
    if (DEV_MODE_ACTIVE) {
      localStorage.removeItem(DEV_MODE_STORAGE_KEY);
    } else {
      localStorage.setItem(DEV_MODE_STORAGE_KEY, "true");
    }
    window.location.reload();
  }, []);

  return { isEnabled: DEV_MODE_ACTIVE, toggle };
}
