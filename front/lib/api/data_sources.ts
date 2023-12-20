import {
  APIError,
  ConnectorProvider,
  ConnectorsAPI,
  CoreAPI,
  DataSourceType,
  Err,
  Ok,
  Result,
} from "@dust-tt/types";
import { Op } from "sequelize";

import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { sendGithubDeletionEmail } from "@app/lib/email";
import { DataSource } from "@app/lib/models";
import logger from "@app/logger/logger";
import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";

export async function getDataSource(
  auth: Authenticator,
  name: string
): Promise<DataSourceType | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  const dataSource = await DataSource.findOne({
    where: auth.isUser()
      ? {
          workspaceId: owner.id,
          visibility: {
            [Op.or]: ["public", "private", "unlisted"],
          },
          name,
        }
      : {
          workspaceId: owner.id,
          // Do not include 'unlisted' here.
          visibility: "public",
          name,
        },
  });

  if (!dataSource) {
    return null;
  }

  return {
    id: dataSource.id,
    name: dataSource.name,
    description: dataSource.description,
    visibility: dataSource.visibility,
    dustAPIProjectId: dataSource.dustAPIProjectId,
    connectorId: dataSource.connectorId,
    connectorProvider: dataSource.connectorProvider,
    assistantDefaultSelected: dataSource.assistantDefaultSelected,
  };
}

export async function getDataSources(
  auth: Authenticator
): Promise<DataSourceType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const dataSources = await DataSource.findAll({
    where: auth.isUser()
      ? {
          workspaceId: owner.id,
          visibility: {
            [Op.or]: ["public", "private", "unlisted"],
          },
        }
      : {
          workspaceId: owner.id,
          // Do not include 'unlisted' here.
          visibility: "public",
        },
    order: [["updatedAt", "DESC"]],
  });

  return dataSources.map((dataSource): DataSourceType => {
    return {
      id: dataSource.id,
      name: dataSource.name,
      description: dataSource.description,
      visibility: dataSource.visibility,
      dustAPIProjectId: dataSource.dustAPIProjectId,
      connectorId: dataSource.connectorId,
      connectorProvider: dataSource.connectorProvider,
      assistantDefaultSelected: dataSource.assistantDefaultSelected,
    };
  });
}
export async function deleteDataSource(
  auth: Authenticator,
  dataSourceName: string
): Promise<Result<{ success: true }, APIError>> {
  const workspace = auth.workspace();
  if (!workspace) {
    return new Err({
      type: "workspace_not_found",
      message: "Could not find the workspace.",
    });
  }
  if (!auth.isAdmin()) {
    return new Err({
      type: "workspace_auth_error",
      message:
        "Only users that are `admins` for the current workspace can delete data sources.",
    });
  }
  const dataSource = await DataSource.findOne({
    where: {
      workspaceId: workspace.id,
      name: dataSourceName,
    },
  });
  if (!dataSource) {
    return new Err({
      type: "data_source_not_found",
      message: "Could not find the data source.",
    });
  }

  const dustAPIProjectId = dataSource.dustAPIProjectId;

  const connectorsAPI = new ConnectorsAPI(logger);
  if (dataSource.connectorId) {
    const connDeleteRes = await connectorsAPI.deleteConnector(
      dataSource.connectorId.toString(),
      true
    );
    if (connDeleteRes.isErr()) {
      // If we get a not found we proceed with the deletion of the data source. This will enable
      // us to retry deletion of the data source if it fails at the Core level.
      if (connDeleteRes.error.error.type !== "connector_not_found") {
        return new Err({
          type: "internal_server_error",
          message: `Error deleting connector: ${connDeleteRes.error.error.message}`,
        });
      }
    }
  }

  const coreAPI = new CoreAPI(logger);
  const coreDeleteRes = await coreAPI.deleteDataSource({
    projectId: dustAPIProjectId,
    dataSourceName: dataSource.name,
  });
  if (coreDeleteRes.isErr()) {
    return new Err({
      type: "internal_server_error",
      message: `Error deleting core data source: ${coreDeleteRes.error.message}`,
    });
  }

  await dataSource.destroy();

  await launchScrubDataSourceWorkflow({
    wId: workspace.sId,
    dustAPIProjectId,
  });
  if (dataSource.connectorProvider)
    await warnPostDeletion(auth, dataSource.connectorProvider);

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
      const adminEmails = (await getMembers(auth, "admin")).map((u) => u.email);
      // send email to admins
      for (const email of adminEmails) await sendGithubDeletionEmail(email);
      break;
    default:
      break;
  }
}
