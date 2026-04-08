import { Authenticator } from "@app/lib/auth";
import type { ExploratoryToolCallInfo } from "@app/lib/reinforced_skills/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types/assistant/generation";
import { ApplicationFailure } from "@temporalio/common";

export async function getAuthForWorkspace(
  workspaceId: string
): Promise<Authenticator> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw ApplicationFailure.nonRetryable(
      `Workspace not found: ${workspaceId}`
    );
  }
  // The auth needs access to all groups to access conversations in projects.
  return Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });
}

/**
 * Build continuation messages from exploratory tool calls and their results.
 * Returns an assistant function-call message followed by function-result messages.
 *
 * Defined in a standalone module so that Temporal workflow files can import it
 * without pulling in heavy deps (zod, etc.).
 */
export function buildContinuationMessages(
  exploratoryToolCalls: ExploratoryToolCallInfo[],
  toolResults: Record<string, string>
): ModelMessageTypeMultiActionsWithoutContentFragment[] {
  const messages: ModelMessageTypeMultiActionsWithoutContentFragment[] = [];

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
