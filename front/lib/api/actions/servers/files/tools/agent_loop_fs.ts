import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";

import { DustFileSystem } from "@app/lib/api/file_system";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type AgentLoopConversationExtra = Pick<ToolHandlerExtra, "agentLoopContext">;

export function requireAgentLoopConversation(
  extra: AgentLoopConversationExtra
): Result<ConversationWithoutContentType, MCPError> {
  const conversation = extra.agentLoopContext?.runContext?.conversation;
  if (!conversation) {
    return new Err(
      new MCPError("No conversation context available.", { tracked: false })
    );
  }

  return new Ok(conversation);
}

/** Collects non-empty scoped paths from tool arguments for {@link DustFileSystem.forAgentLoop}. */
export function scopedPathsFromArgs(
  ...paths: Array<string | undefined>
): string[] {
  return paths.filter(
    (path): path is string => typeof path === "string" && path.length > 0
  );
}

export async function getDustFileSystemForAgentLoop(
  auth: Authenticator,
  conversation: ConversationWithoutContentType,
  scopedPaths: string[]
): Promise<Result<DustFileSystem, MCPError>> {
  const fsResult = await DustFileSystem.forAgentLoop(auth, {
    conversation,
    scopedPaths,
  });
  if (fsResult.isErr()) {
    return new Err(new MCPError(fsResult.error.message, { tracked: false }));
  }

  return new Ok(fsResult.value);
}
