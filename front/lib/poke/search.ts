import type { ConnectorType } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { PokeItemBase } from "@dust-tt/types/dist/front/lib/poke";

import config from "@app/lib/api/config";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import {
  dataSourceToPokeJSON,
  dataSourceViewToPokeJSON,
} from "@app/lib/poke/utils";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";

// TODO: Implement search on workspaces.
export async function searchPokeResources(
  auth: Authenticator,
  searchTerm: string
): Promise<PokeItemBase[]> {
  const resourceInfo = getResourceNameAndIdFromSId(searchTerm);
  if (resourceInfo) {
    return searchPokeResourcesBySId(auth, resourceInfo);
  } else {
    // Fallback to handle resources without the cool sId format.
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
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const cRes = await connectorsAPI.getConnector(searchTerm);
    if (cRes.isOk()) {
      const connector: ConnectorType = cRes.value;

      return [
        {
          id: parseInt(connector.id),
          name: `Connector`,
          link: `${config.getClientFacingUrl()}/poke/${connector.workspaceId}/data_sources/${connector.dataSourceId}`,
        },
      ];
    }
  }

  return [];
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
