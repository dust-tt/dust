import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type {
  LightAgentConfigurationType,
  SupportedResourceType,
} from "@app/types";
import type { LightWorkspaceType } from "@app/types";
import { assertNever } from "@app/types";

export type ResourceTypeMap = {
  agents: LightAgentConfigurationType;
  apps: AppResource;
  workspaces: LightWorkspaceType;
  data_sources: DataSourceResource;
  mcp_server_views: MCPServerViewResource;
  spaces: SpaceResource;
  data_source_views: DataSourceViewResource;
  triggers: TriggerResource;
  global: null;
};

export async function fetchPluginResource<T extends SupportedResourceType>(
  auth: Authenticator,
  resourceType: T,
  resourceId: string
): Promise<ResourceTypeMap[T] | null> {
  let result: unknown = null;

  switch (resourceType) {
    case "agents":
      result = await getAgentConfiguration(auth, {
        agentId: resourceId,
        variant: "light",
      });
      break;
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
    case "mcp_server_views":
      result = await MCPServerViewResource.fetchById(auth, resourceId);
      break;
    case "spaces":
      result = await SpaceResource.fetchById(auth, resourceId);
      break;
    case "triggers":
      result = await TriggerResource.fetchById(auth, resourceId);
      break;
    case "global":
      result = null;
      break;
    default:
      assertNever(resourceType);
  }

  return result as ResourceTypeMap[T] | null;
}
