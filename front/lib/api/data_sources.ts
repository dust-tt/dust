import type {
  APIError,
  ConnectorProvider,
  DataSourceType,
  Result,
} from "@dust-tt/types";
import { ConnectorsAPI, CoreAPI, Err, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { sendGithubDeletionEmail } from "@app/lib/email";
import { DataSourceResource } from "@app/lib/resources/datasource_resource";
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

export async function updateDataSourceEditedBy(
  auth: Authenticator,
  dataSource: DataSourceType
): Promise<Result<undefined, APIError>> {
  const owner = auth.workspace();
  const user = auth.user();
  if (!owner || !user) {
    return new Err({
      type: "workspace_not_found",
      message: "Could not find the workspace.",
    });
  }

  if (!auth.isAdmin()) {
    return new Err({
      type: "workspace_auth_error",
      message:
        "Only users that are `admins` for the current workspace can update data sources.",
    });
  }

  const dataSourceResource = await DataSourceResource.fetchByModelId(
    dataSource.id
  );

  if (!dataSourceResource) {
    return new Err({
      type: "data_source_not_found",
      message: "Could not find the data source.",
    });
  }

  await dataSourceResource.update({
    editedAt: new Date(),
    editedByUserId: user.id,
  });

  return new Ok(undefined);
}

export async function deleteDataSource(
  auth: Authenticator,
  dataSourceName: string
): Promise<Result<{ success: true }, APIError>> {
  const owner = auth.workspace();
  if (!owner) {
    return new Err({
      type: "workspace_not_found",
      message: "Could not find the workspace.",
    });
  }

  if (!auth.isBuilder()) {
    return new Err({
      type: "workspace_auth_error",
      message:
        "Only users that are `builders` for the current workspace can delete data sources.",
    });
  }

  const dataSource = await DataSourceResource.fetchByName(auth, dataSourceName);

  if (!dataSource) {
    return new Err({
      type: "data_source_not_found",
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
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can delete connected data sources.",
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
      // us to retry deletion of the data source if it fails at the Core level.
      if (connDeleteRes.error.type !== "connector_not_found") {
        return new Err({
          type: "internal_server_error",
          message: `Error deleting connector`,
          connectors_error: connDeleteRes.error,
        });
      }
    }
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const coreDeleteRes = await coreAPI.deleteDataSource({
    projectId: dustAPIProjectId,
    dataSourceName: dataSource.name,
  });
  if (coreDeleteRes.isErr()) {
    if (coreDeleteRes.error.code !== "data_source_not_found") {
      return new Err({
        type: "internal_server_error",
        message: `Error deleting core data source: ${coreDeleteRes.error.message}`,
        data_source_error: coreDeleteRes.error,
      });
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

  return new Ok({ success: true });
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
