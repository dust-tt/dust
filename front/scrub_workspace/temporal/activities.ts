import {
  archiveAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration";
import { isGlobalAgentId } from "@app/lib/api/assistant/global_agents";
import { deleteDataSource, getDataSources } from "@app/lib/api/data_sources";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { sendAdminDataDeletionEmail } from "@app/lib/email";

export async function sendDataDeletionEmail({
  remainingDays,
  workspaceId,
}: {
  remainingDays: number;
  workspaceId: string;
}) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const adminEmails = (await getMembers(auth, { roles: ["admin"] })).map(
    (u) => u.email
  );
  for (const adminEmail of adminEmails)
    await sendAdminDataDeletionEmail({ email: adminEmail, remainingDays });
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
  await archiveAssistants(auth);
  await deleteDatasources(auth);
}

async function archiveAssistants(auth: Authenticator) {
  const agentConfigurations = await getAgentConfigurations({
    auth,
    agentsGetView: "admin_internal",
    variant: "full",
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
