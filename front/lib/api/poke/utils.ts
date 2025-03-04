import type { SupportedResourceType } from "@dust-tt/types";
import type { LightWorkspaceType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";

import { getWorkspaceInfos } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

export type ResourceTypeMap = {
  apps: AppResource;
  workspaces: LightWorkspaceType;
  data_sources: DataSourceResource;
  spaces: SpaceResource;
  data_source_views: DataSourceViewResource;
  global: null;
};

export async function fetchPluginResource<T extends SupportedResourceType>(
  auth: Authenticator,
  resourceType: T,
  resourceId: string
): Promise<ResourceTypeMap[T] | null> {
  let result: unknown = null;

  switch (resourceType) {
    case "apps":
      result = await AppResource.fetchById(auth, resourceId);
      break;
    case "workspaces":
      result = await getWorkspaceInfos(resourceId);
      break;
    case "data_sources":
      result = await DataSourceResource.fetchById(auth, resourceId);
      break;
    case "data_source_views":
      result = await DataSourceViewResource.fetchById(auth, resourceId);
      break;
    case "spaces":
      result = await SpaceResource.fetchById(auth, resourceId);
      break;
    case "global":
      result = null;
      break;
    default:
      assertNever(resourceType);
  }

  return result as ResourceTypeMap[T] | null;
}
