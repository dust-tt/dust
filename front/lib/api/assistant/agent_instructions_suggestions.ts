import { pruneConflictingInstructionSuggestions } from "@app/lib/api/assistant/agent_suggestion_pruning";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
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
 * Checks a set of edits that are proposed together, without touching the database: at most one
 * edit per block, no root rewrite mixed with block edits, and a single top-level element per
 * block edit.
 */
export function validateInstructionEdits(
  edits: InstructionsSuggestionSchemaType[]
): Result<undefined, string> {
  // Reject batches where multiple edits target the same block.
  const targetBlockIds = edits.map((edit) => edit.targetBlockId);
  const uniqueTargetBlockIds = new Set(targetBlockIds);
  if (uniqueTargetBlockIds.size !== targetBlockIds.length) {
    return new Err(
      "Multiple suggestions target the same block ID. Use a single suggestion per block. " +
        `For full rewrites, target '${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}' instead.`
    );
  }

  // Reject batches mixing a full-rewrite (root) edit with block-targeted edits: a root suggestion
  // and a block suggestion accepted together would both remain pending even though applying the
  // root rewrite makes the block suggestion inapplicable.
  if (
    targetBlockIds.length > 1 &&
    targetBlockIds.includes(INSTRUCTIONS_ROOT_TARGET_BLOCK_ID)
  ) {
    return new Err(
      `A suggestion targeting '${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}' replaces the entire ` +
        "instructions and cannot be proposed alongside suggestions for other blocks in the " +
        "same call."
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

  return new Ok(undefined);
}

/**
 * @cc [owner:avervaet,label:mcp] caller-checks-pending-limit
 * `createAgentInstructionSuggestions` does NOT enforce a cap on how many `instructions`
 * suggestions accumulate for an agent: every caller MUST check the pending count with
 * `canAddPendingSuggestions` (see its own contract) before calling.
 */
/**
 * @cc [owner:avervaet,label:product] no-mixed-root-and-block-suggestions
 * A batch MUST NOT mix a `instructions-root` edit with edits targeting other blocks: both would
 * be created as `pending`, but accepting the root rewrite makes the other suggestions
 * inapplicable, so the batch is rejected instead of creating suggestions that pruning cannot
 * reconcile after the fact.
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
    conversation,
    batch = null,
  }: {
    agentConfiguration: AgentConfigurationType;
    edits: InstructionSuggestionEditInput[];
    source: AgentSuggestionSource;
    conversation: ConversationResource | ConversationWithoutContentType | null;
    batch?: BatchSuggestionResource | null;
  }
): Promise<Result<CreatedInstructionSuggestion[], string>> {
  const validation = validateInstructionEdits(edits);
  if (validation.isErr()) {
    return validation;
  }

  const suggestions = await AgentSuggestionResource.createSuggestionsForAgent(
    auth,
    agentConfiguration,
    edits.map(({ analysis, ...suggestionData }) => ({
      kind: "instructions" as const,
      suggestion: suggestionData,
      analysis: analysis ?? null,
      state: "pending" as const,
      source,
      conversationId: conversation?.id ?? null,
      batchId: batch?.id ?? null,
    }))
  );

  const created: CreatedInstructionSuggestion[] = suggestions.map(
    (suggestion, index) => ({
      sId: suggestion.sId,
      kind: "instructions" as const,
      targetBlockId: edits[index].targetBlockId,
    })
  );

  await pruneConflictingInstructionSuggestions(
    auth,
    agentConfiguration,
    created
  );

  return new Ok(created);
}
