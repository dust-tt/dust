import config from "@app/lib/api/config";
import {
  findWorkspaceByWorkOSOrganizationId,
  getWorkspaceInfos,
  unsafeGetWorkspacesByModelId,
} from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { tryParsePhoneNumber } from "@app/lib/plans/trial/phone";
import {
  dataSourceToPokeJSON,
  dataSourceViewToPokeJSON,
} from "@app/lib/poke/utils";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { ConnectorType } from "@app/types/data_source";
import type { PokeItemBase } from "@app/types/poke";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import { validate as validateUuid } from "uuid";

async function searchPokeWorkspaces(
  searchTerm: string
): Promise<PokeItemBase[]> {
  const workspaceInfos = await getWorkspaceInfos(searchTerm);
  if (workspaceInfos) {
    return [
      {
        id: workspaceInfos.id,
        name: workspaceInfos.name,
        link: `${config.getPokeAppUrl()}/${workspaceInfos.sId}`,
        type: "Workspace",
      },
    ];
  }

  const workspaceModelId = parseInt(searchTerm, 10);
  if (!isNaN(workspaceModelId)) {
    const workspaces = await unsafeGetWorkspacesByModelId([workspaceModelId]);
    if (workspaces.length > 0) {
      return workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        link: `${config.getPokeAppUrl()}/${w.sId}`,
        type: "Workspace",
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
          name: workspaceByOrgId.name,
          link: `${config.getPokeAppUrl()}/${workspaceByOrgId.sId}`,
          type: "Workspace",
        },
      ];
    }
  }

  return [];
}

async function searchByStripeSubscriptionId(
  searchTerm: string
): Promise<PokeItemBase[]> {
  if (!searchTerm.startsWith("sub_")) {
    return [];
  }

  const subscription = await SubscriptionResource.fetchByStripeId(searchTerm);
  if (!subscription) {
    return [];
  }

  const workspaces = await unsafeGetWorkspacesByModelId([
    subscription.workspaceId,
  ]);
  if (workspaces.length === 0) {
    return [];
  }

  const workspace = workspaces[0];
  return [
    {
      id: workspace.id,
      name: workspace.name,
      link: `${config.getPokeAppUrl()}/${workspace.sId}`,
      type: "Workspace",
    },
  ];
}

async function searchConnectorModelId(
  searchTerm: string
): Promise<PokeItemBase[] | null> {
  const connectorModelId = parseInt(searchTerm, 10);
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

      const workspace = await WorkspaceResource.fetchById(
        connector.workspaceId
      );
      if (!workspace) {
        return null;
      }

      return [
        {
          id: parseInt(connector.id, 10),
          name: `${workspace.name}'s ${asDisplayName(connector.type)}`,
          link: `${config.getPokeAppUrl()}/${connector.workspaceId}/data_sources/${connector.dataSourceId}`,
          type: "Connector",
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

async function searchPokeFrames(searchTerm: string): Promise<PokeItemBase[]> {
  // Share tokens are UUIDs.
  if (!validateUuid(searchTerm)) {
    return [];
  }

  const res = await FileResource.fetchByShareTokenWithContent(searchTerm);
  if (!res) {
    return [];
  }

  const { file } = res;

  const [workspace] = await WorkspaceResource.fetchByModelIds([
    file.workspaceId,
  ]);
  if (!workspace) {
    return [];
  }

  return [
    {
      id: file.id,
      name: `Frame (token: ${searchTerm.slice(0, 8)}...)`,
      link: `${config.getPokeAppUrl()}/${workspace.sId}/files/${file.sId}`,
      type: "Frame",
    },
  ];
}

// `dustAPIDataSourceId` is a 64-character hex string; `dustAPIProjectId` is a numeric string.
const DUST_API_DATA_SOURCE_ID_REGEX = /^[0-9a-f]{64}$/i;
const DUST_API_PROJECT_ID_REGEX = /^\d+$/;

async function searchPokeDataSourcesByDustAPIId(
  auth: Authenticator,
  searchTerm: string
): Promise<PokeItemBase[]> {
  let dataSource: DataSourceResource | null = null;
  if (DUST_API_DATA_SOURCE_ID_REGEX.test(searchTerm)) {
    dataSource = await DataSourceResource.fetchByDustAPIDataSourceId(
      auth,
      searchTerm
    );
  } else if (DUST_API_PROJECT_ID_REGEX.test(searchTerm)) {
    dataSource = await DataSourceResource.fetchByDustAPIProjectId(
      auth,
      searchTerm
    );
  }

  if (!dataSource) {
    return [];
  }

  return [await dataSourceToPokeJSON(dataSource)];
}

async function searchByPhoneNumber(
  searchTerm: string
): Promise<PokeItemBase[]> {
  let e164PhoneNumber: string | null;
  try {
    e164PhoneNumber = tryParsePhoneNumber(searchTerm);
  } catch (err) {
    logger.warn(
      { err: normalizeError(err) },
      "Phone number parsing unavailable; skipping phone-search axis"
    );
    return [];
  }
  if (!e164PhoneNumber) {
    return [];
  }

  const workspaceModelId =
    await WorkspaceVerificationAttemptResource.findWorkspaceModelIdFromPhoneNumber(
      e164PhoneNumber
    );
  if (!workspaceModelId) {
    return [];
  }

  const workspaces = await unsafeGetWorkspacesByModelId([workspaceModelId]);
  if (workspaces.length === 0) {
    return [];
  }

  const workspace = workspaces[0];
  return [
    {
      id: workspace.id,
      name: `${workspace.name} (phone trial)`,
      link: `${config.getPokeAppUrl()}/${workspace.sId}`,
      type: "Workspace",
    },
  ];
}

export async function searchPokeResources(
  auth: Authenticator,
  searchTerm: string
): Promise<PokeItemBase[]> {
  const resourceInfo = getResourceNameAndIdFromSId(searchTerm);
  if (resourceInfo) {
    return searchPokeResourcesBySId(auth, resourceInfo);
  }

  return (
    await Promise.all([
      searchPokeWorkspaces(searchTerm),
      searchPokeConnectors(searchTerm),
      searchPokeFrames(searchTerm),
      searchByStripeSubscriptionId(searchTerm),
      searchByPhoneNumber(searchTerm),
      searchPokeDataSourcesByDustAPIId(auth, searchTerm),
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
