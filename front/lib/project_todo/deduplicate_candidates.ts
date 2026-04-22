// Semantic deduplication for project TODO candidates during the merge workflow.
//
// batchDeduplicateCandidates groups candidates by (userId, category), runs one
// LLM call per non-empty group, and returns a map from the candidate key
// (`${userId}:${itemId}`) to a Resolution describing what Phase 3 should do:
//
//   - existing(todo): link this candidate's source to the existing todo.
//   - leader:         this candidate is the first occurrence of its task —
//                     Phase 3 will create a new todo for it.
//   - follower(key):  this candidate duplicates an earlier candidate in the
//                     same batch (from a different doc). Phase 3 attaches its
//                     source to the todo created for the leader at `key`.
//
// On LLM failure the affected group is treated as all-new (every candidate
// becomes a leader), so the caller always falls back to creating a fresh
// todo rather than silently discarding data.

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
import { startActiveObservation } from "@langfuse/tracing";
import { z } from "zod";

// ── Public types ──────────────────────────────────────────────────────────────

export type DeduplicateCandidate = {
  itemId: string;
  userId: ModelId;
  text: string;
  category: ProjectTodoCategory;
};

// Phase 3's instruction for a single candidate.
export type Resolution =
  // Candidate is a semantic duplicate of an existing todo.
  | { kind: "existing"; todo: ProjectTodoResource }
  // Candidate is the first occurrence of its task in this batch — Phase 3
  // creates a new todo for it (and other candidates in the batch may follow).
  | { kind: "leader" }
  // Candidate duplicates an earlier candidate in the same batch. leaderKey
  // points at that candidate's key in the DeduplicationMap.
  | { kind: "follower"; leaderKey: string };

// Key: `${userId}:${itemId}`. Absence of a key means "treat as leader" —
// equivalent to an explicit `{ kind: "leader" }` entry. The dedup writer is
// free to omit leaders to keep the map small.
export type DeduplicationMap = Map<string, Resolution>;

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
      // Set when this candidate is a semantic duplicate of an existing TODO.
      duplicate_of_sid: z.string().optional(),
      // Set when this candidate is a semantic duplicate of an *earlier*
      // candidate in the same batch (lower candidate_index). Mutually
      // exclusive with duplicate_of_sid.
      duplicate_of_candidate_index: z.number().int().optional(),
    })
  ),
});

function buildDeduplicationSpec(): AgentActionSpecification {
  return {
    name: REPORT_DUPLICATES_FUNCTION_NAME,
    description:
      "Report which new candidate TODOs are semantic duplicates of existing TODOs or of earlier candidates in the same list.",
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
                  "sId of the matching existing TODO. Omit if the candidate is not a duplicate of any existing TODO.",
              },
              duplicate_of_candidate_index: {
                type: "integer",
                description:
                  "0-based index of an EARLIER candidate (strictly lower than candidate_index) that this candidate duplicates. Omit if the candidate is not a duplicate of an earlier candidate. Never set together with duplicate_of_sid.",
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
    "",
    "Two items are duplicates only if completing one would make the other",
    "redundant. If both could independently appear on a task list without",
    "overlap, they are distinct — even if they share keywords or domain.",
    "", //
    "A candidate that is a more specific or more general version of an",
    "existing TODO is still a duplicate if the core task is the same.",
    "",
    "Candidates may also duplicate each other (same task mentioned in two",
    "different source documents). In that case, set",
    "duplicate_of_candidate_index on the later candidate to the index of",
    "the EARLIER one (strictly lower index). Never reference a forward or",
    "same index.",
    "",
    "When in doubt, treat the candidate as new. A false duplicate merge",
    "loses data; a missed dedup just creates a minor duplicate that can",
    "be cleaned up later.",
    "",
    "Existing TODOs:",
    existingLines,
    "",
    "New candidates:",
    candidateLines,
    "",
    "Call report_duplicates with one entry per candidate. For each one:",
    "- set duplicate_of_sid if the candidate matches an existing TODO;",
    "- else set duplicate_of_candidate_index if the candidate matches an",
    "  earlier candidate in the list;",
    "- else leave both fields unset (the candidate is genuinely new).",
    "Never set both fields on the same candidate.",
  ].join("\n");
}

// ── LLM call for a single (userId, category) group ───────────────────────────

// Raw match produced by the LLM before chain resolution. "existing" points at
// an existing TODO's sId; "follower" at an earlier candidate's index in the
// SAME group's candidate list.
export type LLMMatch =
  | { kind: "existing"; sId: string }
  | { kind: "follower"; candidateIndex: number };

// Returns a map from candidate index (0-based) to the LLMMatch reported by
// the model, or an empty map on failure (every candidate treated as a leader).
// Precondition: all candidates must share the same category — batchDeduplicateCandidates
// enforces this by grouping on makeDedupGroupKey before calling here.
export async function runDeduplicationLLMCall(
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
): Promise<Map<number, LLMMatch>> {
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

  const res = await startActiveObservation(
    "project-todo-deduplicate-candidates",
    () =>
      runMultiActionsAgent(
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
            "You identify semantic duplicates among TODO items. " +
            "Err on the side of treating items as new — only match when clearly redundant.",
          specifications: [specification],
          forceToolCall: specification.name,
        },
        {
          context: {
            operationType: "project_todo_deduplicate_candidates",
            workspaceId: owner.sId,
          },
        }
      )
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

  // Map candidateIndex → LLMMatch. Entries are only populated for candidates
  // the LLM classified as duplicates. Missing entries mean "leader".
  const matches = new Map<number, LLMMatch>();
  for (const m of parsed.data.matches) {
    // Defensive: the LLM is instructed never to set both, but if it does,
    // prefer the existing-TODO match (stronger claim than a batch peer).
    if (m.duplicate_of_sid) {
      matches.set(m.candidate_index, {
        kind: "existing",
        sId: m.duplicate_of_sid,
      });
      continue;
    }
    if (typeof m.duplicate_of_candidate_index === "number") {
      // Backward-only: reject forward or self references so the chain
      // resolver can assume topological order.
      if (m.duplicate_of_candidate_index < m.candidate_index) {
        matches.set(m.candidate_index, {
          kind: "follower",
          candidateIndex: m.duplicate_of_candidate_index,
        });
      }
    }
  }
  return matches;
}

// ── Chain resolution ─────────────────────────────────────────────────────────

// Walks a group's LLM matches in candidate-index order and produces a
// DeduplicationMap entry per candidate. Pure so it can be unit-tested without
// a real LLM call.
//
// Resolution rules, applied in order:
//   1. LLM reports existing(sId) — if the sId resolves to a known todo, the
//      candidate becomes `existing(todo)`. If the sId is hallucinated
//      (unknown), fall through to the next rule.
//   2. LLM reports follower(prevIdx) — the candidate inherits the leader of
//      prevIdx: if prev resolves to existing(todo), collapse to that todo;
//      if prev is a leader, become follower(prev's key); if prev is itself a
//      follower, become follower of the transitive leader. Chain collapsing
//      keeps Phase 3's lookup to a single hop.
//   3. No LLM match, or any of the above fell through — the candidate is a
//      leader: omit it from the map (absence is the default leader state).
export function resolveDeduplicationChains(
  candidates: DeduplicateCandidate[],
  matches: Map<number, LLMMatch>,
  existingTodos: ProjectTodoResource[]
): DeduplicationMap {
  const result: DeduplicationMap = new Map();
  const todosById = new Map(existingTodos.map((t) => [t.sId, t]));

  // Per-index resolution, used during the walk to resolve follower references.
  // "leader" is represented as null here (not stored in `result`).
  const perIndex: Array<Resolution | null> = candidates.map(() => null);

  for (let i = 0; i < candidates.length; i++) {
    const match = matches.get(i);
    const key = makeDedupResultKey(candidates[i].userId, candidates[i].itemId);

    if (match?.kind === "existing") {
      const todo = todosById.get(match.sId);
      if (todo) {
        const res: Resolution = { kind: "existing", todo };
        perIndex[i] = res;
        result.set(key, res);
        continue;
      }
      // Hallucinated sId — treat as leader.
    }

    if (match?.kind === "follower") {
      const prev = perIndex[match.candidateIndex];
      if (prev?.kind === "existing") {
        // Collapse follower-of-existing to existing so Phase 3 skips the
        // leader-lookup hop entirely.
        perIndex[i] = prev;
        result.set(key, prev);
        continue;
      }
      if (prev?.kind === "follower") {
        // Transitive: point at the root leader.
        perIndex[i] = prev;
        result.set(key, prev);
        continue;
      }
      // prev is null → it resolved to leader. Point at its key.
      const leaderKey = makeDedupResultKey(
        candidates[match.candidateIndex].userId,
        candidates[match.candidateIndex].itemId
      );
      const res: Resolution = { kind: "follower", leaderKey };
      perIndex[i] = res;
      result.set(key, res);
      continue;
    }

    // Leader — omit from the map (absence means leader).
    perIndex[i] = null;
  }

  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

// Runs semantic deduplication for all new candidates. Groups candidates by
// (userId, category), executes one LLM call per group (up to 4 concurrent),
// and returns a DeduplicationMap keyed by `${userId}:${itemId}`. Missing
// entries mean the candidate is a leader — Phase 3 will create a new todo.
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

      // Single candidate + no existing todos → nothing for the LLM to compare
      // against. Fast path: treat as leader (no map entry).
      if (existingTodos.length === 0 && groupCandidates.length <= 1) {
        return;
      }

      const matches = await runDeduplicationLLMCall(auth, {
        model,
        candidates: groupCandidates,
        existingTodos,
      });

      const groupResolutions = resolveDeduplicationChains(
        groupCandidates,
        matches,
        existingTodos
      );

      for (const [key, resolution] of groupResolutions) {
        deduplicationMap.set(key, resolution);
      }
    },
    { concurrency: 4 }
  );

  return deduplicationMap;
}
