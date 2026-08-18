import { workspaceActiveSeatsCacheOperations } from "@app/lib/api/workspace_seats/cache";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { CacheOperations } from "@app/lib/utils/cache_operations";
import type { PokeCacheResourceDescriptor } from "@app/types/api/poke/cache";
import {
  buildCacheKey,
  buildCacheKeyPattern,
  CACHE_RESOURCE_REGISTRY,
} from "@app/types/shared/cache_resource_registry";

const migratedCacheOperations = [
  WorkspaceResource.byIdCacheOperations,
  SkillResource.listActiveCacheOperations,
  workspaceActiveSeatsCacheOperations,
];

function legacyCacheOperations(): CacheOperations[] {
  return CACHE_RESOURCE_REGISTRY.map((resource) => ({
    description: {
      id: resource.id,
      label: resource.label,
      params: resource.params,
      supportsBulkInvalidation: resource.resolverKeyPattern !== undefined,
    },
    buildKey: (params) => buildCacheKey(resource, params),
    keyPattern: buildCacheKeyPattern(resource),
  }));
}

export function getPokeCacheOperations(
  id: string
): CacheOperations | undefined {
  const resolvedId = id === "membership_seats" ? "workspace_active_seats" : id;
  return (
    migratedCacheOperations.find(
      (operations) => operations.description.id === resolvedId
    ) ??
    legacyCacheOperations().find(
      (operations) => operations.description.id === id
    )
  );
}

export function getPokeCacheCatalog(): PokeCacheResourceDescriptor[] {
  const migratedIds = new Set(
    migratedCacheOperations.map((operations) => operations.description.id)
  );

  return [
    ...migratedCacheOperations,
    ...legacyCacheOperations().filter(
      (operations) => !migratedIds.has(operations.description.id)
    ),
  ]
    .map((operations) => ({
      id: operations.description.id,
      label: operations.description.label,
      params: operations.description.params,
      keyPattern: operations.keyPattern,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
