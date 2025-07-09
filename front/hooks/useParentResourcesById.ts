import { useEffect, useState } from "react";

import type { DataSourceViewContentNode } from "@app/types";

export function useParentResourcesById({
  selectedResources,
}: {
  selectedResources: DataSourceViewContentNode[];
}) {
  const [parentsById, setParentsById] = useState<Record<string, Set<string>>>(
    {}
  );

  useEffect(() => {
    const newParentsById: Record<string, Set<string>> = {};
    selectedResources.forEach((resource) => {
      if (resource.parentInternalIds) {
        newParentsById[resource.internalId] = new Set(
          resource.parentInternalIds
        );
      }
    });
    setParentsById(newParentsById);
  }, [selectedResources]);

  return { parentsById, setParentsById };
}
