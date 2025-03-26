import type { NavigationSelectionType } from "@app/hooks/usePersistedNavigationSelection";
import { NAVIGATION_SELECTION_METADATA_NAME } from "@app/hooks/usePersistedNavigationSelection";
import { safeParseJSON } from "@app/types";

import type { UserResource } from "./resources/user_resource";

// Server-side counterpart of usePersistedNavigationSelection
export const getPersistedNavigationSelection = async (
  user: UserResource
): Promise<NavigationSelectionType> => {
  const metadata = await user.getMetadata(NAVIGATION_SELECTION_METADATA_NAME);

  if (!metadata) {
    return {};
  }

  const r = safeParseJSON(metadata.value);
  if (r.isOk()) {
    return r.value as NavigationSelectionType;
  }

  return {};
};
