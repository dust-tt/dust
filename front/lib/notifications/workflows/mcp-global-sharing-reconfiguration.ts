import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import type { TransactionalEmailCopy } from "@app/lib/notifications/transactional_emails";
import type { MCPGlobalSharingReconfigurationPayloadType } from "@app/lib/notifications/triggers/mcp-global-sharing-reconfiguration";
import { MCPGlobalSharingReconfigurationPayloadSchema } from "@app/lib/notifications/triggers/mcp-global-sharing-reconfiguration";
import { MCP_GLOBAL_SHARING_RECONFIGURATION_TRIGGER_ID } from "@app/types/notification_preferences";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { workflow } from "@novu/framework";

export function buildMCPGlobalSharingReconfigurationEmailCopy(
  i18n: I18n,
  {
    workspaceName,
    toolName,
    agentNames,
  }: Pick<
    MCPGlobalSharingReconfigurationPayloadType,
    "workspaceName" | "toolName" | "agentNames"
  >
): TransactionalEmailCopy {
  return {
    subject: i18n._(
      msg`[Dust] Agents to reconfigure after sharing ${toolName}`
    ),
    content: [
      i18n._(
        msg`You're receiving this as an admin of the Dust workspace ${workspaceName}.`
      ),
      i18n._(
        msg`The tool ${toolName} was just made available to all workspace members.`
      ),
      i18n._(
        msg`This removes older space-specific versions of the same tool. The following agents may need to be reconfigured:`
      ),
      ...agentNames.map((agentName) => `• ${agentName}`),
      i18n._(msg`Please review these agents and add the tool again if needed.`),
    ].join("\n"),
  };
}

export const mcpGlobalSharingReconfigurationWorkflow = workflow(
  MCP_GLOBAL_SHARING_RECONFIGURATION_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("mcp-global-sharing-reconfiguration-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content } =
        buildMCPGlobalSharingReconfigurationEmailCopy(i18n, payload);

      const body = await renderEmail({
        i18n,
        name: subscriber.firstName ?? undefined,
        workspace: { id: payload.workspaceId, name: payload.workspaceName },
        content,
      });
      return { subject, body };
    });
  },
  { payloadSchema: MCPGlobalSharingReconfigurationPayloadSchema }
);
