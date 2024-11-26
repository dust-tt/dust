import type { UserType } from "@dust-tt/types";
import { safeParseJSON } from "@dust-tt/types";

import type { NavigationSelectionType } from "@app/hooks/usePersistedNavigationSelection";
import { NAVIGATION_SELECTION_METADATA_NAME } from "@app/hooks/usePersistedNavigationSelection";
import { getUserMetadata } from "@app/lib/api/user";

// Server-side counterpart of usePersistedNavigationSelection
export const getPersistedNavigationSelection = async (
  user: UserType
): Promise<NavigationSelectionType> => {
  const metadata = await getUserMetadata(
    user,
    NAVIGATION_SELECTION_METADATA_NAME
  );

  if (!metadata) {
    return {};
  }

  const r = safeParseJSON(metadata.value);
  if (r.isOk()) {
    return r.value as NavigationSelectionType;
  }

  return {};
};
