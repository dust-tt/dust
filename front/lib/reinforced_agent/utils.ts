import { Authenticator } from "@app/lib/auth";
import type { ExploratoryToolCallInfo } from "@app/lib/reinforced_agent/types";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
import { ApplicationFailure } from "@temporalio/common";

/**
 * Build continuation messages from exploratory tool calls and their results.
 * Returns an assistant function-call message followed by function-result messages.
 *
 * Defined in a standalone module (rather than in run_reinforced_analysis.ts) so
 * that Temporal workflow files can import it without pulling in heavy deps (zod, etc.).
 */
export function buildContinuationMessages(
  exploratoryToolCalls: ExploratoryToolCallInfo[],
  toolResults: Record<string, string>
): ModelMessageTypeMultiActionsWithoutContentFragment[] {
  const messages: ModelMessageTypeMultiActionsWithoutContentFragment[] = [];

  // Assistant message with function calls in `contents` (the format used by
  // the Anthropic conversion layer).
  messages.push({
    role: "assistant" as const,
    function_calls: [],
    contents: exploratoryToolCalls.map((tc) => ({
      type: "function_call" as const,
      value: {
        id: tc.id,
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      },
    })),
  });

  // Function result messages — one per tool call.
  for (const tc of exploratoryToolCalls) {
    messages.push({
      role: "function" as const,
      name: tc.name,
      function_call_id: tc.id,
      content: toolResults[tc.id] ?? "",
    });
  }

  return messages;
}

export async function getAuthForWorkspace(
  workspaceId: string
): Promise<Authenticator> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw ApplicationFailure.nonRetryable(
      `Workspace not found: ${workspaceId}`
    );
  }
  // The auth need access to all groups to access conversations in projects
  return Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });
}

/**
 * List recent conversation sIds that involved a specific agent.
 *
 * Uses `getAuthForWorkspace` internally so that conversations in personal
 * projects are included (the auth has access to all groups).
 */
export async function listRecentConversationsForAgent(
  workspaceId: string,
  {
    agentConfigurationId,
    cutoffDate,
    excludeHumanOutOfTheLoop = true,
  }: {
    agentConfigurationId: string;
    cutoffDate: Date;
    excludeHumanOutOfTheLoop?: boolean;
  }
): Promise<string[]> {
  const auth = await getAuthForWorkspace(workspaceId);

  const convSIdsByAgent = await ConversationResource.getConversationSIdsByAgent(
    auth,
    {
      agentSIds: [agentConfigurationId],
      cutoffDate,
      excludeHumanOutOfTheLoop,
    }
  );
  return convSIdsByAgent.get(agentConfigurationId) ?? [];
}
