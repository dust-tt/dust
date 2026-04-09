// This module provides LLM-assisted deduplication for project todo candidates
// collected during the merge workflow. It is called after the per-conversation
// fast-path source lookup to avoid creating duplicate ProjectTodo rows for
// items that are semantically equivalent to existing todos created from other
// conversations or manually entered by users.
//
// Algorithm — one LLM call per (userId, category) group:
//   1. Fetch existing ProjectTodos for that userId+category in the space (up to
//      MAX_EXISTING_FOR_DEDUP most-recent items).
//   2. If no existing todos: skip — all candidates in the group are new.
//   3. Otherwise: call the LLM with a forced `deduplicate_todos` tool call,
//      passing the existing-todo list and the candidate list.
//   4. Return a Map<candidateIndex, existing ProjectTodoResource | null>.
//      - non-null  → the candidate duplicates that existing todo; caller links source only.
//      - null      → the candidate is new; caller creates a new ProjectTodo.
//
// Failure policy: LLM errors are best-effort — if the call or parse fails,
// all candidates in the affected group are treated as new (no false merges).

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { ProjectTodoCategory } from "@app/types/project_todo";
import type { ModelId } from "@app/types/shared/model_id";
import { z } from "zod";

const DEDUPLICATE_TODOS_FUNCTION_NAME = "deduplicate_todos";

// Cap the number of existing todos included in the prompt so that context size
// stays bounded regardless of how many todos a user has accumulated.
const MAX_EXISTING_FOR_DEDUP = 50;

// A candidate todo that did not match any existing source via the fast-path
// conversation-source lookup and therefore needs LLM-assisted deduplication.
export type DeduplicationCandidate = {
  index: number;
  text: string;
  category: ProjectTodoCategory;
  userId: ModelId;
};

// Module-level constant — the spec object is immutable and identical across all calls.
const DEDUPLICATE_SPEC: AgentActionSpecification = {
  name: DEDUPLICATE_TODOS_FUNCTION_NAME,
  description:
    "For each new candidate item, identify the existing todo it duplicates, if any.",
  inputSchema: {
    type: "object",
    properties: {
      matches: {
        type: "array",
        description:
          "One entry per candidate item, in the same order as listed.",
        items: {
          type: "object",
          properties: {
            candidate_index: {
              type: "number",
              description: "The 0-based index of the candidate item.",
            },
            existing_sId: {
              type: "string",
              description:
                "The sId of the existing todo this candidate duplicates, or the literal string 'none' if it is a distinct new item.",
            },
          },
          required: ["candidate_index", "existing_sId"],
        },
      },
    },
    required: ["matches"],
  },
};

const DeduplicateMatchSchema = z.object({
  candidate_index: z.number().int(),
  existing_sId: z.string(),
});

const DeduplicateResultSchema = z.object({
  matches: z.array(DeduplicateMatchSchema),
});

// Calls the LLM with a forced deduplicate_todos tool call and returns a map
// from candidate index to the matched existing todo's sId, or null for new items.
// Returns null if the LLM call fails or the output cannot be parsed.
async function callDeduplicateLLM(
  auth: Authenticator,
  {
    candidates,
    existingTodos,
    model,
    category,
  }: {
    candidates: DeduplicationCandidate[];
    existingTodos: ProjectTodoResource[];
    model: ModelConfigurationType;
    category: ProjectTodoCategory;
  }
): Promise<Map<number, string | null> | null> {
  const owner = auth.getNonNullableWorkspace();
  const specification = DEDUPLICATE_SPEC;

  const existingList = existingTodos
    .map((t) => `- [${t.sId}] "${t.text}"`)
    .join("\n");
  const candidateList = candidates
    .map((c) => `- [${c.index}] "${c.text}"`)
    .join("\n");

  const prompt = [
    "You are reviewing a project todo list to avoid creating duplicates.",
    `Category: ${category}`,
    "",
    "Existing project todos:",
    existingList,
    "",
    "New items extracted from conversations:",
    candidateList,
    "",
    "Two todos are duplicates if they refer to the same underlying task, decision, or" +
      " fact — even if phrased differently.",
    `Call the ${DEDUPLICATE_TODOS_FUNCTION_NAME} tool with one match entry per candidate item.`,
  ].join("\n");

  // Construct a minimal conversation containing only the prompt as a user message.
  // The dedup call does not need a full conversation rendering — the todo lists
  // themselves carry all the context the LLM needs.
  const conv = {
    messages: [
      {
        role: "user" as const,
        name: "todo_deduplicator",
        content: [{ type: "text" as const, text: prompt }],
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
      prompt,
      specifications: [specification],
      forceToolCall: specification.name,
    },
    {
      context: {
        operationType: "project_todo_deduplicate",
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    logger.warn(
      { error: res.error, workspaceId: owner.sId },
      "Project todo dedup: LLM call failed"
    );
    return null;
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    logger.warn(
      { workspaceId: owner.sId },
      "Project todo dedup: no tool call in LLM response"
    );
    return null;
  }

  const parsed = DeduplicateResultSchema.safeParse(action.arguments);
  if (!parsed.success) {
    logger.warn(
      { error: parsed.error, workspaceId: owner.sId },
      "Project todo dedup: failed to parse LLM response"
    );
    return null;
  }

  const result = new Map<number, string | null>();
  for (const match of parsed.data.matches) {
    result.set(
      match.candidate_index,
      match.existing_sId === "none" ? null : match.existing_sId
    );
  }
  return result;
}

// Deduplicates a flat list of candidates against existing ProjectTodos in the
// space by grouping them per (userId, category) and running one LLM call per
// non-empty group.
//
// Returns a Map from each candidate's index to the matching existing
// ProjectTodoResource (duplicate) or null (new item).
export async function deduplicateTodoCandidates(
  auth: Authenticator,
  {
    spaceModelId,
    candidates,
    model,
  }: {
    spaceModelId: ModelId;
    candidates: DeduplicationCandidate[];
    model: ModelConfigurationType;
  }
): Promise<Map<number, ProjectTodoResource | null>> {
  const result = new Map<number, ProjectTodoResource | null>();

  // Group candidates by (userId, category) so we make one LLM call per group.
  const groups = new Map<string, DeduplicationCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.userId}:${candidate.category}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  // Process groups concurrently — each group writes to disjoint candidate indices
  // in `result`, so there is no cross-group data dependency.
  await concurrentExecutor(
    Array.from(groups.values()),
    async (groupCandidates) => {
      const { userId, category } = groupCandidates[0];

      const existingTodos =
        await ProjectTodoResource.fetchLatestByUserAndCategory(auth, {
          spaceId: spaceModelId,
          userId,
          category,
          limit: MAX_EXISTING_FOR_DEDUP,
        });

      if (existingTodos.length === 0) {
        // Nothing to dedup against — all candidates are new.
        for (const candidate of groupCandidates) {
          result.set(candidate.index, null);
        }
        return;
      }

      const existingBySId = new Map(existingTodos.map((t) => [t.sId, t]));

      const llmResult = await callDeduplicateLLM(auth, {
        candidates: groupCandidates,
        existingTodos,
        model,
        category,
      });

      for (const candidate of groupCandidates) {
        if (!llmResult) {
          // LLM failed: fall through to creation (best-effort dedup, no false merges).
          result.set(candidate.index, null);
          continue;
        }

        const matchedSId = llmResult.get(candidate.index);
        if (matchedSId == null) {
          result.set(candidate.index, null);
        } else {
          // Map the sId back to the resource; if the LLM hallucinated a non-existent
          // sId, we treat it as new to avoid losing data.
          result.set(candidate.index, existingBySId.get(matchedSId) ?? null);
        }
      }
    },
    { concurrency: 3 }
  );

  return result;
}
