import {
  APIError,
  ConnectorProvider,
  ConnectorsAPI,
  CoreAPI,
  CoreAPIDocument,
  DataSourceType,
  Err,
  Ok,
  Result,
} from "@dust-tt/types";

import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { sendGithubDeletionEmail } from "@app/lib/email";
import { DataSource } from "@app/lib/models";
import logger from "@app/logger/logger";
import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";

export function getProviderLogoPathForDataSource(
  ds: DataSourceType
): string | null {
  const provider = ds.connectorProvider;

  if (!provider) {
    return null;
  }

  switch (provider) {
    case "notion":
      return `/static/notion_32x32.png`;

    case "slack":
      return `/static/slack_32x32.png`;

    case "github":
      return `/static/github_black_32x32.png`;
    case "google_drive":
      return `/static/google_drive_32x32.png`;
    case "intercom":
      return `/static/intercom_32x32.png`;
    default:
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ((_provider: never) => {
        // cannot happen
        // this is to make sure we handle all cases
      })(provider);
      return null;
  }
}

export function getDisplayNameForDocument(document: CoreAPIDocument): string {
  const titleTagPrefix = "title:";
  const titleTag = document.tags.find((tag) => tag.startsWith(titleTagPrefix));
  if (!titleTag) {
    return document.document_id;
  }
  return titleTag.substring(titleTagPrefix.length);
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
