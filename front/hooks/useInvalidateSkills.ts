import { isString } from "@app/types/shared/utils/general";
import { useCallback } from "react";
import { useSWRConfig } from "swr";

/**
 * @cc [owner:aubin-tchoi,label:react] invalidate-workspace-skill-lists
 * Revalidate string-keyed skill lists and array-keyed skill searches for the
 * given workspace, regardless of query parameters or search body. Do not
 * revalidate other workspaces or individual skill detail endpoints.
 */
export function useInvalidateSkills({ workspaceId }: { workspaceId: string }) {
  const { mutate } = useSWRConfig();
  const skillsUrl = `/api/w/${workspaceId}/skills`;
  const searchUrl = `${skillsUrl}/search`;

  return useCallback(
    () =>
      mutate((key) =>
        isString(key)
          ? key.split("?")[0] === skillsUrl
          : Array.isArray(key) && key[0] === searchUrl
      ),
    [mutate, skillsUrl, searchUrl]
  );
}
