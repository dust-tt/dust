import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import type { Authenticator } from "@app/lib/auth";
import {
  intelligenceAwuFromRunUsages,
  toolAwuFromActions,
} from "@app/lib/metronome/events";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";

interface CreditActionMinimalInput {
  internalMCPServerName: string | null;
  status: ToolExecutionStatus;
}

interface CreditAgentMessageMinimalInput {
  id: ModelId;
  runIds: string[] | null;
}

export function computeAgentMessageCredits({
  runUsages,
  actions,
}: {
  runUsages: RunUsageType[];
  actions: CreditActionMinimalInput[];
}): number | null {
  const finalActions = actions.filter((a) =>
    isToolExecutionStatusFinal(a.status)
  );

  if (runUsages.length === 0 && finalActions.length === 0) {
    return null;
  }

  return (
    intelligenceAwuFromRunUsages(runUsages) + toolAwuFromActions(finalActions)
  );
}

export async function fetchRunUsagesByAgentMessageId(
  auth: Authenticator,
  agentMessages: CreditAgentMessageMinimalInput[]
): Promise<Map<ModelId, RunUsageType[]>> {
  const result = new Map<ModelId, RunUsageType[]>();

  const dustRunIds = [...new Set(agentMessages.flatMap((m) => m.runIds ?? []))];
  if (dustRunIds.length === 0) {
    return result;
  }

  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  const usages = await RunResource.listRunUsagesForRuns(auth, { runs });

  const dustRunIdByRunModelId = new Map(runs.map((r) => [r.id, r.dustRunId]));
  const usagesByDustRunId = new Map<string, RunUsageType[]>();
  for (const usage of usages) {
    const dustRunId = dustRunIdByRunModelId.get(usage.runModelId);
    if (!dustRunId) {
      continue;
    }
    const existing = usagesByDustRunId.get(dustRunId);
    if (existing) {
      existing.push(usage);
    } else {
      usagesByDustRunId.set(dustRunId, [usage]);
    }
  }

  for (const message of agentMessages) {
    result.set(
      message.id,
      (message.runIds ?? []).flatMap(
        (runId) => usagesByDustRunId.get(runId) ?? []
      )
    );
  }

  return result;
}

export async function computeConversationCreditCost(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<number | null> {
  const agentMessages = await ConversationResource.listAgentMessageCostInputs(
    auth,
    conversation.id
  );
  if (agentMessages.length === 0) {
    return null;
  }

  const [runUsagesByAgentMessageId, actions] = await Promise.all([
    fetchRunUsagesByAgentMessageId(auth, agentMessages),
    AgentMCPActionResource.listByAgentMessageIds(
      auth,
      agentMessages.map((m) => m.id)
    ),
  ]);

  const actionsByAgentMessageId = new Map<
    ModelId,
    { internalMCPServerName: string | null; status: ToolExecutionStatus }[]
  >();
  for (const action of actions) {
    const existing = actionsByAgentMessageId.get(action.agentMessageId) ?? [];
    existing.push({
      internalMCPServerName: action.metadata.internalMCPServerName,
      status: action.status,
    });
    actionsByAgentMessageId.set(action.agentMessageId, existing);
  }

  let total = 0;
  let hasBillableUsage = false;
  for (const message of agentMessages) {
    const credits = computeAgentMessageCredits({
      runUsages: runUsagesByAgentMessageId.get(message.id) ?? [],
      actions: actionsByAgentMessageId.get(message.id) ?? [],
    });
    if (credits !== null) {
      total += credits;
      hasBillableUsage = true;
    }
  }

  return hasBillableUsage ? total : null;
}
