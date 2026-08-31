import type { ExecutionBill } from "@app/lib/api/assistant/consumption/bill";
import { isProgrammaticUsage } from "@app/lib/api/programmatic_usage/tracking";
import type { Authenticator } from "@app/lib/auth";
import { ingestMetronomeEvents } from "@app/lib/metronome/client";
import { buildUsageEvents, getUsageType } from "@app/lib/metronome/events";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { isHiddenHelperSubAgentId } from "@app/types/assistant/assistant";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";

export async function emitAgentMessageUsageEvent(
  auth: Authenticator,
  {
    agentMessageId,
    bill,
    runKey,
    rootAgentMessageId,
    status,
    timestamp,
  }: {
    agentMessageId: string;
    bill: ExecutionBill;
    runKey: string;
    rootAgentMessageId: string;
    status: AgentMessageStatus;
    timestamp: string;
  }
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  const context = await ConversationResource.fetchAgentMessageUsageEventContext(
    auth,
    {
      agentMessageId,
    }
  );
  if (!context) {
    logger.warn(
      { workspaceId: workspace.sId, agentMessageId, runKey },
      "[Consumption] Agent message not found while emitting a usage event."
    );
    return;
  }

  const origin = context.origin ?? "web";
  const usageType = getUsageType(
    isProgrammaticUsage(auth, { userMessageOrigin: origin }),
    origin
  );

  const [runUsages, actions, attributedAgent, apiKeyName, freeSeat] =
    await Promise.all([
      RunResource.listRunUsagesByModelIds(auth, {
        runUsageModelIds: bill.runUsageModelIds,
      }),
      AgentMCPActionResource.listByAgentMessageIds(auth, [
        context.agentMessageModelId,
      ]),
      resolveAttributedAgent(auth, context),
      resolveApiKeyName(auth, context.apiKeyModelId),
      isFreeSeatedUser(auth, context.userId),
    ]);
  const emittedActionModelIds = new Set(bill.actionModelIds);
  const events = buildUsageEvents({
    workspaceId: workspace.sId,
    isByok: auth.getNonNullablePlan().isByok,
    conversationId: context.conversationId,
    userId: context.userId,
    isFreeSeatedUser: freeSeat,
    agentMessageId,
    ...attributedAgent,
    parentAgentMessageId: context.parentAgentMessageId,
    rootAgentMessageId,
    runKey,
    runUsages,
    actions: actions.map((action) => {
      const serialized = action.toJSON();
      return {
        toolName: serialized.toolName,
        mcpServerId: serialized.mcpServerId,
        internalMCPServerName: serialized.internalMCPServerName,
        status: serialized.status,
        executionDurationMs: serialized.executionDurationMs,
        shouldEmit: emittedActionModelIds.has(action.id),
      };
    }),
    origin,
    usageType,
    authMethod: context.authMethod,
    apiKeyName,
    messageStatus: status,
    isSubAgentMessage: context.isSubAgentMessage,
    timestamp,
    billedCredits: bill.eventCreditAmount,
  });
  if (events.length !== 1) {
    throw new Error(`Execution ${runKey} did not produce one usage event`);
  }

  await ingestMetronomeEvents(events);
}

async function resolveAttributedAgent(
  auth: Authenticator,
  context: {
    agentConfigurationId: string | null;
    isSubAgentMessage: boolean;
    parentAgentMessageId: string | null;
  }
): Promise<{ agentId: string | null; subAgentId: string | null }> {
  const { agentConfigurationId, isSubAgentMessage, parentAgentMessageId } =
    context;
  if (
    !isSubAgentMessage ||
    !parentAgentMessageId ||
    !agentConfigurationId ||
    !isHiddenHelperSubAgentId(agentConfigurationId)
  ) {
    return { agentId: agentConfigurationId, subAgentId: null };
  }

  const parentAgentId =
    await ConversationResource.fetchAgentConfigurationIdForAgentMessage(auth, {
      agentMessageId: parentAgentMessageId,
    });

  return parentAgentId
    ? { agentId: parentAgentId, subAgentId: agentConfigurationId }
    : { agentId: agentConfigurationId, subAgentId: null };
}

async function isFreeSeatedUser(
  auth: Authenticator,
  userId: string | null
): Promise<boolean> {
  if (userId === null) {
    return false;
  }

  const user = await UserResource.fetchById(userId);
  if (!user) {
    return false;
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: renderLightWorkspaceType({
        workspace: auth.getNonNullableWorkspace(),
      }),
    });

  return membership?.seatType === "free";
}

async function resolveApiKeyName(
  auth: Authenticator,
  apiKeyModelId: number | null
): Promise<string | null> {
  if (apiKeyModelId === null) {
    return null;
  }

  const key = await KeyResource.fetchByWorkspaceAndId({
    workspace: auth.getNonNullableWorkspace(),
    id: apiKeyModelId,
  });

  return key && !key.isSystem ? key.name : null;
}
