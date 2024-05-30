import type {
  APIError,
  ConnectorProvider,
  CoreAPIDataSourceDocumentSection,
  CredentialsType,
  DataSourceType,
  Result,
  WorkspaceType,
} from "@dust-tt/types";
import {
  ConnectorsAPI,
  CoreAPI,
  Err,
  formatUserFullName,
  Ok,
} from "@dust-tt/types";

import { dataSourceSearchUpsert } from "@app/lib/api/data_sources_search";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { sendGithubDeletionEmail } from "@app/lib/email";
import { DataSource } from "@app/lib/models/data_source";
import { User } from "@app/lib/models/user";
import logger from "@app/logger/logger";
import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";

export const MANAGED_DS_DELETABLE_AS_BUILDER: ConnectorProvider[] = [
  "webcrawler",
];

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
    createdAt: dataSource.createdAt.getTime(),
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

  const dataSources = await DataSource.findAll({
    where: {
      workspaceId: owner.id,
    },
    ...includes,
    order: [["updatedAt", "DESC"]],
  });

  return dataSources.map((dataSource): DataSourceType => {
    return {
      id: dataSource.id,
      createdAt: dataSource.createdAt.getTime(),
      name: dataSource.name,
      description: dataSource.description,
      dustAPIProjectId: dataSource.dustAPIProjectId,
      connectorId: dataSource.connectorId,
      connectorProvider: dataSource.connectorProvider,
      assistantDefaultSelected: dataSource.assistantDefaultSelected,
      ...makeEditedBy(dataSource.editedByUser, dataSource.editedAt),
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
    if (coreDeleteRes.error.code !== "data_source_not_found") {
      return new Err({
        type: "internal_server_error",
        message: `Error deleting core data source: ${coreDeleteRes.error.message}`,
        data_source_error: coreDeleteRes.error,
      });
    }
  }

  await dataSource.destroy();

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

export async function upsertToDataSource({
  owner,
  dataSource,
  projectId,
  dataSourceName,
  documentId,
  timestamp,
  tags,
  parents,
  sourceUrl,
  section,
  credentials,
  lightDocumentOutput = false,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  projectId: string;
  dataSourceName: string;
  documentId: string;
  timestamp?: number | null;
  tags: string[];
  parents: string[];
  sourceUrl?: string | null;
  section: CoreAPIDataSourceDocumentSection;
  credentials: CredentialsType;
  lightDocumentOutput?: boolean;
}) {
  const coreAPI = new CoreAPI(logger);
  const upsertRes = await coreAPI.upsertDataSourceDocument({
    projectId: projectId,
    dataSourceName: dataSourceName,
    documentId: documentId,
    tags: tags,
    parents: parents,
    sourceUrl,
    timestamp: timestamp,
    section,
    credentials,
    lightDocumentOutput: lightDocumentOutput,
  });
  if (upsertRes.isErr()) {
    return upsertRes;
  }

  // We are not waiting for the search index to be updated before returning the response.
  async function upsertToSearchIndex() {
    const coreDocument = await coreAPI.getDataSourceDocument({
      projectId: projectId,
      dataSourceName: dataSource.name,
      documentId: documentId,
    });
    if (coreDocument.isErr()) {
      return coreDocument;
    }

    let content = coreDocument.value.document.text;

    if (content) {
      const title =
        tags.find((t) => t.startsWith("title"))?.split(":")[1] ||
        content.substring(0, 50) + "...";

      content = content
        .split("\n")
        .filter((line) => !line.startsWith("$"))
        .join("\n");

      dataSourceSearchUpsert({
        owner,
        dataSource,
        documentId,
        title: title,
        content,
      }).catch((error) =>
        logger.error(
          { error: error, workspaceId: owner.sId, documentId },
          "Error upserting to search index"
        )
      );
    }
  }
  upsertToSearchIndex()
    .then(() => {
      logger.info(
        { workspaceId: owner.sId, documentId, dataSourceName: dataSource.name },
        "Upserted to search index"
      );
    })
    .catch((error) => {
      logger.error(
        { error: error, workspaceId: owner.sId, documentId },
        "Error upserting to search index"
      );
    });

  return upsertRes;
}
