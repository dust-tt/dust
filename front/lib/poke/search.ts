import config from "@app/lib/api/config";
import {
  getWorkspaceInfos,
  unsafeGetWorkspacesByModelId,
} from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import {
  dataSourceToPokeJSON,
  dataSourceViewToPokeJSON,
} from "@app/lib/poke/utils";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type { PokeItemBase } from "@app/types";
import type { ConnectorType } from "@app/types";
import { ConnectorsAPI } from "@app/types";

async function searchPokeWorkspaces(
  searchTerm: string
): Promise<PokeItemBase[]> {
  const workspaceInfos = await getWorkspaceInfos(searchTerm);
  if (workspaceInfos) {
    return [
      {
        id: workspaceInfos.id,
        name: `Workspace (${workspaceInfos.name})`,
        link: `${config.getClientFacingUrl()}/poke/${workspaceInfos.sId}`,
      },
    ];
  }

  const workspaceModelId = parseInt(searchTerm);
  if (!isNaN(workspaceModelId)) {
    const workspaces = await unsafeGetWorkspacesByModelId([workspaceModelId]);
    if (workspaces.length > 0) {
      return workspaces.map((w) => ({
        id: w.id,
        name: `Workspace (${w.name})`,
        link: `${config.getClientFacingUrl()}/poke/${w.sId}`,
      }));
    }
  }

  return [];
}

async function searchPokeConnectors(
  searchTerm: string
): Promise<PokeItemBase[]> {
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
  const cRes = await connectorsAPI.getConnector(searchTerm);
  if (cRes.isOk()) {
    const connector: ConnectorType = {
      ...cRes.value,
      connectionId: null,
    };

    return [
      {
        id: parseInt(connector.id),
        name: "Connector",
        link: `${config.getClientFacingUrl()}/poke/${connector.workspaceId}/data_sources/${connector.dataSourceId}`,
      },
    ];
  }

  return [];
}

export async function searchPokeResources(
  auth: Authenticator,
  searchTerm: string
): Promise<PokeItemBase[]> {
  const resourceInfo = getResourceNameAndIdFromSId(searchTerm);
  if (resourceInfo) {
    return searchPokeResourcesBySId(auth, resourceInfo);
  }

  // Fallback to handle resources without the cool sId format.
  const resources = (
    await Promise.all([
      searchPokeWorkspaces(searchTerm),
      searchPokeConnectors(searchTerm),
    ])
  ).flat();

  return resources;
}

async function searchPokeResourcesBySId(
  auth: Authenticator,
  resourceInfo: Exclude<ReturnType<typeof getResourceNameAndIdFromSId>, null>
): Promise<PokeItemBase[]> {
  const { resourceName, sId } = resourceInfo;

  switch (resourceName) {
    case "data_source_view":
      const dataSourceView = await DataSourceViewResource.fetchById(auth, sId);
      if (!dataSourceView) {
        return [];
      }

      return [await dataSourceViewToPokeJSON(dataSourceView)];

    case "data_source":
      const dataSource = await DataSourceResource.fetchByNameOrId(auth, sId);
      if (!dataSource) {
        return [];
      }

      return [await dataSourceToPokeJSON(dataSource)];

    default:
      return [];
  }
}
