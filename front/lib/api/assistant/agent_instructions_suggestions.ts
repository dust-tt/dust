import { pruneConflictingInstructionSuggestions } from "@app/lib/api/assistant/agent_suggestion_pruning";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type {
  AgentSuggestionSource,
  InstructionsSuggestionSchemaType,
} from "@app/types/suggestions/agent_suggestion";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { JSDOM } from "jsdom";

export type InstructionSuggestionEditInput =
  InstructionsSuggestionSchemaType & {
    analysis?: string;
  };

export interface CreatedInstructionSuggestion {
  sId: string;
  kind: "instructions";
  targetBlockId: string;
}

/** Returns the number of top-level HTML elements in the given HTML string. */
function countTopLevelBlocks(html: string): number {
  const dom = new JSDOM(`<body>${html}</body>`);
  return dom.window.document.body.children.length;
}

/**
 * @cc [owner:avervaet,label:mcp] caller-checks-pending-limit
 * `createAgentInstructionSuggestions` does NOT enforce a cap on how many `instructions`
 * suggestions accumulate for an agent: every caller MUST check the pending count with
 * `canAddPendingSuggestions` (see its own contract) before calling.
 */
/**
 * Validates, creates and prunes `instructions` suggestions. Shared by every surface that lets a
 * model propose block-targeted edits to an agent's instructions (sidekick and conversational
 * building) so they behave identically.
 */
export async function createAgentInstructionSuggestions(
  auth: Authenticator,
  {
    agentConfiguration,
    edits,
    source,
    conversationId,
  }: {
    agentConfiguration: AgentConfigurationType;
    edits: InstructionSuggestionEditInput[];
    source: AgentSuggestionSource;
    // The conversation's internal model id (`ConversationResource["id"]`), matching the
    // `agent_suggestions.conversationId` foreign key — not its `sId`.
    conversationId: number | null;
  }
): Promise<Result<CreatedInstructionSuggestion[], string>> {
  // Reject batches where multiple edits target the same block.
  const targetBlockIds = edits.map((edit) => edit.targetBlockId);
  const uniqueTargetBlockIds = new Set(targetBlockIds);
  if (uniqueTargetBlockIds.size !== targetBlockIds.length) {
    return new Err(
      "Multiple suggestions target the same block ID. Use a single suggestion per block. " +
        `For full rewrites, target '${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}' instead.`
    );
  }

  // Reject non-root edits that contain multiple top-level blocks.
  for (const edit of edits) {
    if (edit.targetBlockId !== INSTRUCTIONS_ROOT_TARGET_BLOCK_ID) {
      const blockCount = countTopLevelBlocks(edit.content);
      if (blockCount > 1) {
        return new Err(
          `Suggestion for block "${edit.targetBlockId}" contains ${blockCount} top-level ` +
            "elements but replace only supports 1. Keep it within a single tag, or use " +
            `targetBlockId '${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}' if the change requires ` +
            "multiple blocks."
        );
      }
    }
  }

  const created: CreatedInstructionSuggestion[] = [];
  for (const { analysis, ...suggestionData } of edits) {
    const suggestion = await AgentSuggestionResource.createSuggestionForAgent(
      auth,
      agentConfiguration,
      {
        kind: "instructions",
        suggestion: suggestionData,
        analysis: analysis ?? null,
        state: "pending",
        source,
        conversationId,
      }
    );

    created.push({
      sId: suggestion.sId,
      kind: "instructions",
      targetBlockId: suggestionData.targetBlockId,
    });
  }

  await pruneConflictingInstructionSuggestions(
    auth,
    agentConfiguration,
    created
  );

  return new Ok(created);
}
