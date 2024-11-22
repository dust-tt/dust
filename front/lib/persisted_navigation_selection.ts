import type { NextApiRequestCookies } from "next/dist/server/api-utils";

import type { NavigationSelectionType } from "@app/hooks/usePersistedNavigationSelection";
import { NAVIGATION_SELECTION_COOKIE_NAME } from "@app/hooks/usePersistedNavigationSelection";

// Server-side counterpart of usePersistedNavigationSelection
export const getPersistedNavigationSelection = (
  cookies: NextApiRequestCookies
): NavigationSelectionType => {
  const selectionCookie = cookies[NAVIGATION_SELECTION_COOKIE_NAME];

  if (!selectionCookie) {
    return {};
  }

  try {
    return JSON.parse(selectionCookie) as NavigationSelectionType;
  } catch (error) {
    console.error("Failed to parse navigation selection cookie:", error);
    return {};
  }
};
