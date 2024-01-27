import type {
  APIError,
  ConnectorProvider,
  DataSourceType,
  Result,
} from "@dust-tt/types";
import {
  ConnectorsAPI,
  CoreAPI,
  Err,
  formatUserFullName,
  Ok,
} from "@dust-tt/types";

import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { sendGithubDeletionEmail } from "@app/lib/email";
import { DataSource, User } from "@app/lib/models";
import logger from "@app/logger/logger";
import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";

function makeEditedBy(
  editedByUser: User | undefined,
  editedAt: Date | undefined
) {
  if (!editedByUser || !editedAt) {
    return undefined;
  }

  return {
    editedByUser: {
      editedAt: editedAt.getTime(),
      fullName: formatUserFullName(editedByUser),
      imageUrl: editedByUser.imageUrl,
    },
  };
}

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

  const includes = includeEditedBy
    ? {
        include: [
          {
            model: User,
            as: "editedByUser",
          },
        ],
      }
    : undefined;

  const dataSource = await DataSource.findOne({
    where: {
      workspaceId: owner.id,
      name,
    },
    ...includes,
  });

  if (!dataSource) {
    return null;
  }

  return {
    id: dataSource.id,
    name: dataSource.name,
    description: dataSource.description,
    dustAPIProjectId: dataSource.dustAPIProjectId,
    connectorId: dataSource.connectorId,
    connectorProvider: dataSource.connectorProvider,
    assistantDefaultSelected: dataSource.assistantDefaultSelected,
    ...makeEditedBy(dataSource.editedByUser, dataSource.editedAt),
  };
}

export async function getDataSources(
  auth: Authenticator
): Promise<DataSourceType[]> {
  const owner = auth.workspace();

  // This condition is critical it checks that we can identify the workspace and that the current
  // auth is a user for this workspace. Checking `auth.isUser()` is critical as it would otherwise
  // be possible to access data sources without being authenticated.
  if (!owner || !auth.isUser()) {
    return [];
  }

  const dataSources = await DataSource.findAll({
    where: {
      workspaceId: owner.id,
    },
    order: [["updatedAt", "DESC"]],
  });

  return dataSources.map((dataSource): DataSourceType => {
    return {
      id: dataSource.id,
      name: dataSource.name,
      description: dataSource.description,
      dustAPIProjectId: dataSource.dustAPIProjectId,
      connectorId: dataSource.connectorId,
      connectorProvider: dataSource.connectorProvider,
      assistantDefaultSelected: dataSource.assistantDefaultSelected,
    };
  });
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

  await DataSource.update(
    {
      editedAt: new Date(),
      editedByUserId: user.id,
    },
    {
      where: {
        id: dataSource.id,
        workspaceId: owner.id,
      },
    }
  );

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

  const dataSource = await DataSource.findOne({
    where: {
      workspaceId: owner.id,
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

  if (dataSource.connectorId) {
    if (!auth.isAdmin()) {
      return new Err({
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can delete connected data sources.",
      });
    }

    const connectorsAPI = new ConnectorsAPI(logger);
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

  const coreAPI = new CoreAPI(logger);
  const coreDeleteRes = await coreAPI.deleteDataSource({
    projectId: dustAPIProjectId,
    dataSourceName: dataSource.name,
  });
  if (coreDeleteRes.isErr()) {
    return new Err({
      type: "internal_server_error",
      message: `Error deleting core data source: ${coreDeleteRes.error.message}`,
      data_source_error: coreDeleteRes.error,
    });
  }

  await dataSource.destroy();

  await launchScrubDataSourceWorkflow({
    wId: owner.sId,
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
