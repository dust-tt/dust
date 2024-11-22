import { safeParseJSON } from "@dust-tt/types";
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

  const r = safeParseJSON(selectionCookie);
  if (r.isErr()) {
    console.error("Failed to parse navigation selection cookie:", r.error);
    return {};
  } else {
    return r.value as NavigationSelectionType;
  }
};
