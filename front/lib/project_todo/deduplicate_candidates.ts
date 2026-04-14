// Semantic deduplication for project TODO candidates during the merge workflow.
//
// batchDeduplicateCandidates groups candidates by (userId, category), runs one
// LLM call per non-empty group, and returns a map from the candidate key
// (`${userId}:${itemId}`) to the existing ProjectTodoResource that is a
// semantic duplicate, if any.
//
// On LLM failure the affected group is treated as all-new (no entries in the
// map for those candidates), so the caller always falls back to creating a
// fresh todo rather than silently discarding data.

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { ProjectTodoCategory } from "@app/types/project_todo";
import type { ModelId } from "@app/types/shared/model_id";
import { z } from "zod";

// ── Public types ──────────────────────────────────────────────────────────────

export type DeduplicateCandidate = {
  itemId: string;
  userId: ModelId;
  text: string;
  category: ProjectTodoCategory;
};

// Key: `${userId}:${itemId}`. Value: the existing ProjectTodoResource that this
// candidate is a semantic duplicate of. Absence of a key means the candidate is
// a genuinely new item (no duplicate found or dedup was skipped).
export type DeduplicationMap = Map<string, ProjectTodoResource>;

// Key helpers — exported so the builder (this file) and the consumer
// (merge_into_project.ts) always use the same format.

// Groups candidates/todos by user and category for per-group LLM calls.
export function makeDedupGroupKey(
  userId: ModelId,
  category: ProjectTodoCategory
): string {
  return `${userId}:${category}`;
}

// Identifies a specific (candidate, user) pair in the DeduplicationMap.
export function makeDedupResultKey(userId: ModelId, itemId: string): string {
  return `${userId}:${itemId}`;
}

// ── LLM tool ─────────────────────────────────────────────────────────────────

const REPORT_DUPLICATES_FUNCTION_NAME = "report_duplicates";

const DeduplicationResultSchema = z.object({
  matches: z.array(
    z.object({
      candidate_index: z.number().int(),
      // Omitted when the candidate is a new, distinct item.
      duplicate_of_sid: z.string().optional(),
    })
  ),
});

function buildDeduplicationSpec(): AgentActionSpecification {
  return {
    name: REPORT_DUPLICATES_FUNCTION_NAME,
    description:
      "Report which new candidate TODOs are semantic duplicates of existing ones.",
    inputSchema: {
      type: "object",
      properties: {
        matches: {
          type: "array",
          description: "One entry per new candidate.",
          items: {
            type: "object",
            properties: {
              candidate_index: {
                type: "integer",
                description: "0-based index of the candidate in the list.",
              },
              duplicate_of_sid: {
                type: "string",
                description:
                  "sId of the matching existing TODO. Omit if the candidate is a distinct new item.",
              },
            },
            required: ["candidate_index"],
          },
        },
      },
      required: ["matches"],
    },
  };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildDeduplicationPrompt(
  category: ProjectTodoCategory,
  candidates: DeduplicateCandidate[],
  existingTodos: ProjectTodoResource[]
): string {
  const categoryLabel = category.replace(/_/g, " ");

  const existingLines =
    existingTodos.map((t) => `[${t.sId}] ${t.text}`).join("\n") || "(none)";

  const candidateLines = candidates
    .map((c, i) => `[${i}] ${c.text}`)
    .join("\n");

  return [
    `Deduplicate TODO items for category "${categoryLabel}".`,
    "Two items are duplicates when they describe the same task or decision,",
    "regardless of wording differences.",
    "",
    "Existing TODOs:",
    existingLines,
    "",
    "New candidates:",
    candidateLines,
    "",
    "Call report_duplicates with one entry per candidate.",
    "Include duplicate_of_sid only when the candidate is semantically equivalent",
    "to an existing TODO.",
  ].join("\n");
}

// ── LLM call for a single (userId, category) group ───────────────────────────

// Returns a map from candidate index (0-based) to the sId of the matching
// existing TODO, or an empty map on failure (treat all candidates as new).
// Precondition: all candidates must share the same category — batchDeduplicateCandidates
// enforces this by grouping on makeDedupGroupKey before calling here.
async function runDeduplicationLLMCall(
  auth: Authenticator,
  {
    model,
    candidates,
    existingTodos,
  }: {
    model: ModelConfigurationType;
    candidates: DeduplicateCandidate[];
    existingTodos: ProjectTodoResource[];
  }
): Promise<Map<number, string>> {
  const owner = auth.getNonNullableWorkspace();
  const category = candidates[0].category;
  const prompt = buildDeduplicationPrompt(category, candidates, existingTodos);
  const specification = buildDeduplicationSpec();

  const conv: ModelConversationTypeMultiActions = {
    messages: [
      {
        role: "user",
        name: "deduplication_task",
        content: [{ type: "text", text: prompt }],
      },
    ],
  };

  const res = await runMultiActionsAgent(
    auth,
    {
      providerId: model.providerId,
      modelId: model.modelId,
      functionCall: specification.name,
      useCache: false,
    },
    {
      conversation: conv,
      prompt:
        "You are a TODO deduplication assistant identifying semantic duplicates.",
      specifications: [specification],
      forceToolCall: specification.name,
    },
    {
      context: {
        operationType: "project_todo_deduplicate_candidates",
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    logger.warn(
      { error: res.error, workspaceId: owner.sId },
      "Project todo dedup: LLM call failed, treating all candidates as new"
    );
    return new Map();
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    logger.warn(
      { workspaceId: owner.sId },
      "Project todo dedup: no tool call in LLM response, treating all as new"
    );
    return new Map();
  }

  const parsed = DeduplicationResultSchema.safeParse(action.arguments);
  if (!parsed.success) {
    logger.warn(
      { error: parsed.error, workspaceId: owner.sId },
      "Project todo dedup: failed to parse LLM response, treating all as new"
    );
    return new Map();
  }

  // Map candidateIndex → matched existing sId (only when a match was reported).
  const indexToMatchedSId = new Map<number, string>();
  for (const match of parsed.data.matches) {
    if (match.duplicate_of_sid) {
      indexToMatchedSId.set(match.candidate_index, match.duplicate_of_sid);
    }
  }
  return indexToMatchedSId;
}

// ── Public API ────────────────────────────────────────────────────────────────

// Runs semantic deduplication for all new candidates against existing todos.
// Groups candidates by (userId, category), executes one LLM call per non-empty
// group (up to 4 concurrent), and returns a DeduplicationMap keyed by
// `${userId}:${itemId}`. Missing entries mean no duplicate was found.
export async function batchDeduplicateCandidates(
  auth: Authenticator,
  {
    model,
    candidates,
    existingTodosByGroup,
  }: {
    model: ModelConfigurationType;
    candidates: DeduplicateCandidate[];
    existingTodosByGroup: Map<string, ProjectTodoResource[]>;
  }
): Promise<DeduplicationMap> {
  const deduplicationMap: DeduplicationMap = new Map();

  // Group candidates by (userId, category).
  const groups = new Map<string, DeduplicateCandidate[]>();
  for (const candidate of candidates) {
    const key = makeDedupGroupKey(candidate.userId, candidate.category);
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  await concurrentExecutor(
    Array.from(groups.entries()),
    async ([groupKey, groupCandidates]) => {
      const existingTodos = existingTodosByGroup.get(groupKey) ?? [];

      // No existing todos to compare against — skip the LLM call.
      if (existingTodos.length === 0) {
        return;
      }

      const indexToMatchedSId = await runDeduplicationLLMCall(auth, {
        model,
        candidates: groupCandidates,
        existingTodos,
      });

      const todosBySId = new Map(existingTodos.map((t) => [t.sId, t]));

      for (let i = 0; i < groupCandidates.length; i++) {
        const candidate = groupCandidates[i];
        const matchedSId = indexToMatchedSId.get(i);
        if (!matchedSId) {
          continue;
        }
        const matched = todosBySId.get(matchedSId);
        if (matched) {
          deduplicationMap.set(
            makeDedupResultKey(candidate.userId, candidate.itemId),
            matched
          );
        }
      }
    },
    { concurrency: 4 }
  );

  return deduplicationMap;
}
