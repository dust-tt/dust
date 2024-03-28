import { CoreAPI, isRetrievalConfiguration } from "@dust-tt/types";

import {
  archiveAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration";
import { deleteDataSource, getDataSources } from "@app/lib/api/data_sources";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import {
  sendAdminDowngradeTooMuchDataEmail,
  sendOpsDowngradeTooMuchDataEmail,
} from "@app/lib/email";
import logger from "@app/logger/logger";

export async function sendDataDeletionEmail({
  remainingDays,
  workspaceId,
}: {
  remainingDays: number;
  workspaceId: string;
}) {
  void workspaceId;
  void remainingDays;
}

export async function shouldStillScrubData({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<boolean> {
  return !(
    await Authenticator.internalAdminForWorkspace(workspaceId)
  ).isUpgraded();
}

export async function scrubWorkspaceData({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  await archiveConnectedAgents(auth);
  await deleteConnectedDatasources(auth);
  await checkStaticDatasourcesSize(auth);
}

async function archiveConnectedAgents(auth: Authenticator) {
  const agentConfigurations = await getAgentConfigurations({
    auth,
    agentsGetView: "admin_internal",
    variant: "full",
  });

  // agentconfigurations with a retrieval action with at least a managed
  // data source
  const agentConfigurationsToArchive = agentConfigurations.filter(
    (ac) =>
      ac.action &&
      isRetrievalConfiguration(ac.action) &&
      ac.action.dataSources.length > 0 &&
      ac.action.dataSources.some((ds) => ds.dataSourceId.startsWith("managed-"))
  );
  for (const agentConfiguration of agentConfigurationsToArchive) {
    await archiveAgentConfiguration(auth, agentConfiguration.sId);
  }
}

async function deleteConnectedDatasources(auth: Authenticator) {
  const dataSources = await getDataSources(auth);
  const managedDataSources = dataSources.filter((ds) => !!ds.connectorProvider);
  for (const dataSource of managedDataSources) {
    // call the poke delete datasource endpoint
    const r = await deleteDataSource(auth, dataSource.name);
    if (r.isErr()) {
      throw new Error(`Failed to delete data source: ${r.error.message}`);
    }
  }
}

/**
 * Check the size of the static datasources and send an email to the user and us if it is too big.
 */
async function checkStaticDatasourcesSize(auth: Authenticator) {
  const dataSources = await getDataSources(auth);
  const staticDataSources = dataSources.filter((ds) => !ds.connectorProvider);
  const coreAPI = new CoreAPI(logger);
  const datasourcesTooBig = [];
  logger.info(
    `Checking static datasources sizes for downgrade of ${
      auth.workspace()?.sId
    }`
  );
  for (const ds of staticDataSources) {
    // count total size of all documents of the datasource
    let totalSize = 0;
    for (let i = 0; ; i++) {
      const res = await coreAPI.getDataSourceDocuments({
        projectId: ds.dustAPIProjectId,
        dataSourceName: ds.name,
        limit: 1000,
        offset: 1000 * i,
      });
      if (res.isErr()) {
        throw new Error("Error getting data source documents.");
      }
      totalSize += res.value.documents.reduce(
        (acc, doc) => acc + doc.text_size,
        0
      );
      if (res.value.documents.length < 1000) {
        break;
      }
      i++;
    }

    if (totalSize > 50 * 1024 * 1024) {
      datasourcesTooBig.push(ds.name);
    }
  }

  // send email
  if (datasourcesTooBig.length > 0) {
    logger.info(
      `Downgrade of ${
        auth.workspace()?.sId
      }: datasources too big: ${datasourcesTooBig.join(", ")}.`
    );
    const workspace = auth.workspace();
    if (!workspace) {
      throw new Error("Cannot get workspace.");
    }
    await sendOpsDowngradeTooMuchDataEmail(workspace.sId, datasourcesTooBig);
    // for all admins
    const adminEmails = (await getMembers(auth, { roles: ["admin"] })).map(
      (u) => u.email
    );
    for (const adminEmail of adminEmails)
      await sendAdminDowngradeTooMuchDataEmail(adminEmail, datasourcesTooBig);
  }
}
