import { ConnectorsAPI } from "@dust-tt/types";
import { chunk } from "lodash";

import {
  archiveAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration";
import { isGlobalAgentId } from "@app/lib/api/assistant/global_agents";
import { deleteDataSource, getDataSources } from "@app/lib/api/data_sources";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { destroyConversation } from "@app/lib/conversation";
import { sendAdminDataDeletionEmail } from "@app/lib/email";
import { Conversation } from "@app/lib/models/assistant/conversation";
import logger from "@app/logger/logger";

export async function sendDataDeletionEmail({
  remainingDays,
  workspaceId,
  isLast,
}: {
  remainingDays: number;
  workspaceId: string;
  isLast: boolean;
}) {
  try {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const ws = auth.workspace();
    if (!ws) {
      throw new Error("No workspace found");
    }
    const admins = await getMembers(auth, { roles: ["admin"] });
    for (const a of admins) {
      await sendAdminDataDeletionEmail({
        email: a.email,
        firstName: a.firstName,
        workspaceName: ws.name,
        remainingDays,
        isLast,
      });
    }
  } catch (e) {
    logger.error(
      { panic: true, error: e },
      "Failed to send data deletion email"
    );
    throw e;
  }
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
  await deleteAllConversations(auth);
  await archiveAssistants(auth);
  await deleteDatasources(auth);
}

export async function pauseAllConnectors({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const dataSources = await getDataSources(auth);
  const connectorsApi = new ConnectorsAPI(logger);
  for (const ds of dataSources) {
    if (!ds.connectorId) {
      continue;
    }
    await connectorsApi.pauseConnector(ds.connectorId);
  }
}

async function deleteAllConversations(auth: Authenticator) {
  const workspace = auth.workspace();
  if (!workspace) {
    throw new Error("No workspace found");
  }
  const conversations = await Conversation.findAll({
    where: { workspaceId: workspace.id },
  });
  logger.info(
    { workspaceId: workspace.sId, conversationsCount: conversations.length },
    "Deleting all conversations for workspace."
  );

  const conversationChunks = chunk(conversations, 4);
  for (const conversationChunk of conversationChunks) {
    await Promise.all(
      conversationChunk.map(async (c) => {
        await destroyConversation(workspace, c);
      })
    );
  }
}

async function archiveAssistants(auth: Authenticator) {
  const agentConfigurations = await getAgentConfigurations({
    auth,
    agentsGetView: "admin_internal",
    variant: "light",
  });

  const agentConfigurationsToArchive = agentConfigurations.filter(
    (ac) => !isGlobalAgentId(ac.sId)
  );
  for (const agentConfiguration of agentConfigurationsToArchive) {
    await archiveAgentConfiguration(auth, agentConfiguration.sId);
  }
}

async function deleteDatasources(auth: Authenticator) {
  const dataSources = await getDataSources(auth);
  for (const dataSource of dataSources) {
    const r = await deleteDataSource(auth, dataSource.name);
    if (r.isErr()) {
      throw new Error(`Failed to delete data source: ${r.error.message}`);
    }
  }
}
