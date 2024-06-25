import type {
  ContentNode,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import { useCallback, useEffect, useState } from "react";

import type { GetContentNodeParentsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/parents";

export function useParentResourcesById({
  owner,
  dataSource,
  selectedResources,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType | null;
  selectedResources: ContentNode[];
}) {
  const [parentsById, setParentsById] = useState<Record<string, Set<string>>>(
    {}
  );
  const [parentsAreLoading, setParentsAreLoading] = useState(false);
  const [parentsAreError, setParentsAreError] = useState(false);

  const fetchParents = useCallback(async () => {
    setParentsAreLoading(true);
    try {
      const res = await fetch(
        `/api/w/${owner.sId}/data_sources/${encodeURIComponent(
          dataSource?.name || ""
        )}/managed/parents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            internalIds: selectedResources.map((resource) => {
              return resource.internalId;
            }),
          }),
        }
      );
      if (!res.ok) {
        throw new Error("Failed to fetch parents");
      }
      const json: GetContentNodeParentsResponseBody = await res.json();

      setParentsById(
        json.nodes.reduce(
          (acc, r) => {
            acc[r.internalId] = new Set(r.parents);
            return acc;
          },
          {} as Record<string, Set<string>>
        )
      );
    } catch (e) {
      setParentsAreError(true);
    } finally {
      setParentsAreLoading(false);
    }
  }, [owner, dataSource?.name, selectedResources]);

  const hasParentsById = Object.keys(parentsById || {}).length > 0;
  const hasSelectedResources = selectedResources.length > 0;

  useEffect(() => {
    if (parentsAreLoading || parentsAreError) {
      return;
    }
    if (!hasParentsById && hasSelectedResources) {
      fetchParents().catch(console.error);
    }
  }, [
    hasParentsById,
    hasSelectedResources,
    fetchParents,
    parentsAreLoading,
    parentsAreError,
  ]);

  return { parentsById, setParentsById, parentsAreLoading, parentsAreError };
}
