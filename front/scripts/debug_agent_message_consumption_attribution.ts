/**
 * Diagnose why consumption analytics sees no V4 attribution for one agent message.
 *
 * This script is read-only. It recreates the internal-builder authenticator used by the
 * consumption analytics backfill and compares the attribution conversation fetch with the
 * permission-bypassing fetch used by analytics.
 *
 * npx tsx scripts/debug_agent_message_consumption_attribution.ts \
 *   --workspaceId 0ec9852c2f \
 *   --conversationId gkAXxNcdMC \
 *   --agentMessageId FHO89dLuU2 \
 *   --execute
 */
import {
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { makeScript } from "@app/scripts/helpers";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId.",
    },
    conversationId: {
      type: "string",
      demandOption: true,
      description: "Conversation sId.",
    },
    agentMessageId: {
      type: "string",
      demandOption: true,
      description: "Agent message sId.",
    },
  },
  async (
    { agentMessageId, conversationId, execute, workspaceId },
    logger
  ) => {
    if (!execute) {
      logger.info("Read-only diagnostic. Pass --execute to run it.");
      return;
    }

    const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
    const creditContext =
      await ConversationResource.fetchAgentMessageCreditContext(auth, {
        agentMessageId,
      });

    const [permissionFilteredConversation, analyticsConversation] =
      await Promise.all([
        ConversationResource.fetchById(auth, conversationId),
        ConversationResource.fetchById(auth, conversationId, {
          dangerouslySkipPermissionFiltering: true,
          includeDeleted: true,
        }),
      ]);

    const items = creditContext
      ? await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
          auth,
          {
            agentMessageModelIds: [creditContext.agentMessageModelId],
            maxAttributionVersion:
              AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
          }
        )
      : [];
    const itemCountByVersion = Object.fromEntries(
      [...new Set(items.map((item) => item.attributionVersion))]
        .sort((a, b) => a - b)
        .map((version) => [
          version,
          items.filter((item) => item.attributionVersion === version).length,
        ])
    );
    const currentVersionItemCount = items.filter(
      (item) =>
        item.attributionVersion ===
        AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION
    ).length;
    const trackedStatus = creditContext
      ? AGENT_MESSAGE_STATUSES_TO_TRACK.includes(creditContext.status)
      : false;
    const runIdCount = new Set(creditContext?.runIds ?? []).size;

    const permissionMismatchConfirmed =
      Boolean(creditContext) &&
      trackedStatus &&
      runIdCount > 0 &&
      !permissionFilteredConversation &&
      Boolean(analyticsConversation) &&
      currentVersionItemCount === 0;

    logger.info(
      {
        workspaceId,
        conversationId,
        agentMessageId,
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        creditContextFound: Boolean(creditContext),
        agentMessageModelId: creditContext?.agentMessageModelId,
        agentMessageStatus: creditContext?.status,
        trackedStatus,
        runIdCount,
        permissionFilteredConversationFound: Boolean(
          permissionFilteredConversation
        ),
        analyticsConversationFound: Boolean(analyticsConversation),
        conversationVisibility: analyticsConversation?.visibility,
        conversationSpaceModelId: analyticsConversation?.spaceId,
        requestedSpaceModelIds: analyticsConversation?.requestedSpaceIds,
        currentVersionItemCount,
        itemCountByVersion,
        permissionMismatchConfirmed,
      },
      permissionMismatchConfirmed
        ? "CONFIRMED: attribution silently skips a conversation that analytics can load."
        : "NOT CONFIRMED: inspect the reported gates for the next failing condition."
    );
  }
);
