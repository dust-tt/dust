import { validateAccessToken } from "@connectors/connectors/intercom/lib/intercom_api";
import { ConnectorPermissionRetriever } from "@connectors/connectors/interface";
import { Connector, ModelId } from "@connectors/lib/models";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import { Err, Ok, Result } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";
import { NangoConnectionId } from "@connectors/types/nango_connection_id";
import {
  ConnectorPermission,
  ConnectorResource,
} from "@connectors/types/resources";

const { NANGO_INTERCOM_CONNECTOR_ID } = process.env;

export async function createIntercomConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: NangoConnectionId
): Promise<Result<string, Error>> {
  const nangoConnectionId = connectionId;

  if (!NANGO_INTERCOM_CONNECTOR_ID) {
    throw new Error("NANGO_INTERCOM_CONNECTOR_ID not set");
  }

  const accessToken = await getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: NANGO_INTERCOM_CONNECTOR_ID,
    useCache: false,
  });

  if (!validateAccessToken(accessToken)) {
    return new Err(new Error("Intercom access token is invalid"));
  }

  try {
    const connector = await Connector.create({
      type: "intercom",
      connectionId: nangoConnectionId,
      workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
      defaultNewResourcePermission: "read_write",
    });
    // @todo Daph lauch workflow await launchIntercomSyncWorkflow(connector.id);
    return new Ok(connector.id.toString());
  } catch (e) {
    logger.error({ error: e }, "Error creating Intercom connector.");
    return new Err(e as Error);
  }
}

export async function updateIntercomConnector(
  connectorId: ModelId,
  {
    connectionId,
    newDefaultNewResourcePermission,
  }: {
    connectionId?: NangoConnectionId | null;
    newDefaultNewResourcePermission?: ConnectorPermission | null;
  }
): Promise<Result<string, ConnectorsAPIErrorResponse>> {
  console.log({ connectorId, connectionId, newDefaultNewResourcePermission });
  throw new Error("Not implemented");
}

export async function cleanupIntercomConnector(
  connectorId: string
): Promise<Result<void, Error>> {
  console.log({ connectorId });
  throw new Error("Not implemented");
}

export async function stopIntercomConnector(
  connectorId: string
): Promise<Result<string, Error>> {
  console.log({ connectorId });
  throw new Error("Not implemented");
}

export async function resumeIntercomConnector(
  connectorId: string
): Promise<Result<string, Error>> {
  console.log({ connectorId });
  throw new Error("Not implemented");
}

export async function fullResyncIntercomConnector(
  connectorId: string,
  fromTs: number | null
): Promise<Result<string, Error>> {
  console.log({ connectorId, fromTs });
  throw new Error("Not implemented");
}

export async function retrieveIntercomConnectorPermissions({
  connectorId,
  parentInternalId,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ConnectorResource[], Error>
> {
  console.log({ connectorId, parentInternalId });
  throw new Error("Not implemented");
}

export async function retrieveIntercomResourcesTitles(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<Record<string, string | null>, Error>> {
  console.log({ connectorId, internalIds });
  throw new Error("Not implemented");
}
