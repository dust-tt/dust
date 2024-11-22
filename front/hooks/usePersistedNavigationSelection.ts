import { useCallback } from "react";
import { useCookies } from "react-cookie";

// client-side counterpart of persisted_navigation_selection.ts

export type NavigationSelectionType = {
  lastWorkspaceId?: string;
  lastSpaceId?: string;
};

export const NAVIGATION_SELECTION_COOKIE_NAME = "navigationSelection";

export const usePersistedNavigationSelection = () => {
  // We use cookies instead of local storage because we need to access from SSR
  const [cookies, setCookie] = useCookies([NAVIGATION_SELECTION_COOKIE_NAME]);

  const setNavigationSelection = useCallback(
    (selection: NavigationSelectionType) => {
      const existingSelection = cookies.navigationSelection;

      const newSelection: NavigationSelectionType = {
        ...existingSelection,
        ...selection,
      };

      setCookie(
        NAVIGATION_SELECTION_COOKIE_NAME,
        JSON.stringify(newSelection),
        {
          path: "/",
        }
      );
    },
    [cookies, setCookie]
  );

  const getNavigationSelection = useCallback(() => {
    const selection = cookies.navigationSelection;

    return {
      lastWorkspaceId: selection.lastWorkspaceId,
      lastSpaceId: selection.lastSpaceId,
    } as NavigationSelectionType;
  }, [cookies]);

  return {
    setNavigationSelection,
    getNavigationSelection,
  };
};
