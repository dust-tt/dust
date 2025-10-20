import config from "@app/lib/api/config";
import {
  findWorkspaceByWorkOSOrganizationId,
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
import type { ConnectorType, PokeItemBase } from "@app/types";
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

  if (searchTerm.startsWith("org_")) {
    const workspaceByOrgId =
      await findWorkspaceByWorkOSOrganizationId(searchTerm);
    if (workspaceByOrgId) {
      return [
        {
          id: workspaceByOrgId.id,
          name: `Workspace (${workspaceByOrgId.name})`,
          link: `${config.getClientFacingUrl()}/poke/${workspaceByOrgId.sId}`,
        },
      ];
    }
  }

  return [];
}

async function searchConnectorModelId(searchTerm: string) {
  const connectorModelId = parseInt(searchTerm);
  if (!isNaN(connectorModelId)) {
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
  }
  return null;
}

async function searchPokeConnectors(
  searchTerm: string
): Promise<PokeItemBase[]> {
  const searchResult = await searchConnectorModelId(searchTerm);
  if (searchResult) {
    return searchResult;
  }

  // Support embedded sId in formats like "XXX-YYY-sID" or "XXX-YYY-sID-OTHERSTUFFWITHNUMBERS".
  // useful for logs that are in datadog
  const hyphenParts = searchTerm.split("-");
  if (hyphenParts.length >= 3) {
    const searchResult = await searchConnectorModelId(hyphenParts[2]);
    if (searchResult) {
      return searchResult;
    }
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
  return (
    await Promise.all([
      searchPokeWorkspaces(searchTerm),
      searchPokeConnectors(searchTerm),
    ])
  ).flat();
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
