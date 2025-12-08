import { sendCreditUsageAlertEmail } from "@app/lib/api/email";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";

export interface SendCreditAlertEmailActivityArgs {
  workspaceId: string;
  totalInitialMicroUsd: number;
  totalConsumedMicroUsd: number;
}

export async function sendCreditAlertEmailActivity({
  workspaceId,
  totalInitialMicroUsd,
  totalConsumedMicroUsd,
}: SendCreditAlertEmailActivityArgs): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspace = auth.workspace();

  if (!workspace) {
    logger.error({ workspaceId }, "Workspace not found for credit alert email");
    return;
  }

  const { members: admins } = await getMembers(auth, {
    roles: ["admin"],
    activeOnly: true,
  });

  if (admins.length === 0) {
    logger.warn(
      { workspaceId },
      "No active admins found for credit alert email"
    );
    return;
  }

  const percentUsed = Math.round(
    (totalConsumedMicroUsd / totalInitialMicroUsd) * 100
  );

  for (const admin of admins) {
    await sendCreditUsageAlertEmail({
      email: admin.email,
      workspaceName: workspace.name,
      workspaceSId: workspace.sId,
      percentUsed,
      totalInitialMicroUsd,
      totalConsumedMicroUsd,
    });
  }

  logger.info(
    {
      workspaceId,
      adminCount: admins.length,
      percentUsed,
      totalInitialMicroUsd,
      totalConsumedMicroUsd,
    },
    "Sent credit usage alert emails to workspace admins"
  );
}
