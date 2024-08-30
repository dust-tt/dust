import type {
  ConnectorProvider,
  ConnectorType,
  DataSourceType,
  DataSourceWithConnectorDetailsType,
  Result,
  WithConnector,
} from "@dust-tt/types";
import { ConnectorsAPI, CoreAPI, Err, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { sendGithubDeletionEmail } from "@app/lib/email";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";

export const MANAGED_DS_DELETABLE_AS_BUILDER: ConnectorProvider[] = [
  "webcrawler",
];

export async function getDataSource(
  auth: Authenticator,
  name: string,
  { includeEditedBy }: { includeEditedBy: boolean } = {
    includeEditedBy: false,
  }
): Promise<DataSourceType | null> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return null;
  }

  const dataSource = await DataSourceResource.fetchByName(auth, name, {
    includeEditedBy,
  });

  if (!dataSource) {
    return null;
  }

  return dataSource.toJSON();
}

export async function getDataSources(
  auth: Authenticator,
  { includeEditedBy }: { includeEditedBy: boolean } = {
    includeEditedBy: false,
  }
): Promise<DataSourceType[]> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return [];
  }

  const dataSources = await DataSourceResource.listByWorkspace(auth, {
    includeEditedBy,
  });
  return dataSources.map((dataSource) => dataSource.toJSON());
}

export async function deleteDataSource(
  auth: Authenticator,
  dataSourceName: string
): Promise<
  Result<
    DataSourceType,
    { code: "data_source_not_found" | "unauthorized_deletion"; message: string }
  >
> {
  const owner = auth.getNonNullableWorkspace();

  if (!auth.isBuilder()) {
    return new Err({
      code: "unauthorized_deletion",
      message: "Only builders can delete data sources.",
    });
  }

  const dataSource = await DataSourceResource.fetchByName(auth, dataSourceName);

  if (!dataSource) {
    return new Err({
      code: "data_source_not_found",
      message: "Could not find the data source.",
    });
  }

  const dustAPIProjectId = dataSource.dustAPIProjectId;

  if (dataSource.connectorId && dataSource.connectorProvider) {
    if (
      !MANAGED_DS_DELETABLE_AS_BUILDER.includes(dataSource.connectorProvider) &&
      !auth.isAdmin()
    ) {
      return new Err({
        code: "unauthorized_deletion",
        message:
          "Only users that are `admins` for the current workspace can delete connections.",
      });
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connDeleteRes = await connectorsAPI.deleteConnector(
      dataSource.connectorId.toString(),
      true
    );
    if (connDeleteRes.isErr()) {
      // If we get a not found we proceed with the deletion of the data source. This will enable
      // us to retry deletion of the data source if it fails at a later stage. Otherwise we throw
      // as this is unexpected.
      if (connDeleteRes.error.type !== "connector_not_found") {
        throw new Error(
          "Unexpected error deleting connector: " + connDeleteRes.error.message
        );
      }
    }
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const coreDeleteRes = await coreAPI.deleteDataSource({
    projectId: dustAPIProjectId,
    dataSourceName: dataSource.name,
  });
  if (coreDeleteRes.isErr()) {
    // Same as above we proceed with the deletion if the data source is not found in core. Otherwise
    // we throw as this is unexpected.
    if (coreDeleteRes.error.code !== "data_source_not_found") {
      throw new Error(
        "Unexpected error deleting data source: " + coreDeleteRes.error.message
      );
    }
  }

  await dataSource.delete(auth);

  await launchScrubDataSourceWorkflow({
    wId: owner.sId,
    dustAPIProjectId,
  });
  if (dataSource.connectorProvider) {
    await warnPostDeletion(auth, dataSource.connectorProvider);
  }

  return new Ok(dataSource.toJSON());
}

async function warnPostDeletion(
  auth: Authenticator,
  dataSourceProvider: ConnectorProvider
) {
  // if the datasource is Github, send an email inviting to delete the Github app
  switch (dataSourceProvider) {
    case "github":
      // get admin emails
      const adminEmails = (await getMembers(auth, { roles: ["admin"] })).map(
        (u) => u.email
      );
      // send email to admins
      for (const email of adminEmails) {
        await sendGithubDeletionEmail(email);
      }
      break;
    default:
      break;
  }
}

export async function augmentDataSourceWithConnectorDetails(
  dataSource: DataSourceType & WithConnector
): Promise<DataSourceWithConnectorDetailsType> {
  let connector: ConnectorType | null = null;
  let fetchConnectorError = false;
  let fetchConnectorErrorMessage: string | null = null;
  try {
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const statusRes = await connectorsAPI.getConnector(dataSource.connectorId);
    if (statusRes.isErr()) {
      fetchConnectorError = true;
      fetchConnectorErrorMessage = statusRes.error.message;
    } else {
      connector = statusRes.value;
    }
  } catch (e) {
    // Probably means `connectors` is down, we don't fail to avoid a 500 when just displaying
    // the datasources (eventual actions will fail but a 500 just at display is not desirable).
    // When that happens the managed data sources are shown as failed.
    fetchConnectorError = true;
    fetchConnectorErrorMessage = "Synchonization service is down";
  }

  return {
    ...dataSource,
    connector,
    fetchConnectorError,
    fetchConnectorErrorMessage,
  };
}
