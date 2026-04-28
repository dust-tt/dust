// Semantic deduplication for project TODO candidates during the merge workflow.
//
// batchDeduplicateCandidates groups candidates by (userId, category), runs one
// LLM call per non-empty group, and returns a flat list of DeduplicatedGroup.
// Each group describes one todo that Phase 3 will touch:
//
//   - { kind: "existing", todo, candidates }
//       Attach every candidate's source to the existing todo.
//   - { kind: "new", candidates }
//       Create one new todo using the first candidate's content, then attach
//       every candidate's source to it.
//
// Every input candidate ends up in exactly one DeduplicatedGroup: if the LLM
// forgets to include it in any partition, it is emitted as a singleton
// "new" group so sources are never silently dropped.
//
// The LLM is handed one flat, numbered list of items per (userId, category)
// group — existing todos first, then new candidates — and asked to partition
// it into semantic clusters. Per cluster:
//
//   - no existing → the cluster becomes one "new" group; the first candidate
//     drives the content, the rest attach their sources;
//   - ≥1 existing → the cluster becomes an "existing" group pointing at the
//     first existing todo; every candidate attaches its source to it. Any
//     additional existing todos in the same cluster are ignored (we don't
//     merge existing todos here).
//
// On LLM failure the affected (userId, category) group is treated as all-new
// (one singleton "new" group per candidate), so the caller always falls back
// to creating fresh todos rather than silently discarding data.

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import { startActiveObservation } from "@langfuse/tracing";
import { z } from "zod";

// ── Public types ──────────────────────────────────────────────────────────────

export type DeduplicateCandidate = {
  itemId: string;
  userId: ModelId;
  text: string;
};

// One todo that Phase 3 will touch. A group's candidates all share the same
// userId and category (grouping is per (userId, category) before the LLM
// call).
export type DeduplicatedGroup =
  | {
      kind: "existing";
      todo: ProjectTodoResource;
      candidates: DeduplicateCandidate[];
    }
  | {
      kind: "new";
      // Non-empty. candidates[0] drives the new todo's content; later entries
      // attach their sources to that todo.
      candidates: DeduplicateCandidate[];
    };

// Nested map shape for existing todos passed in by the caller:
// userId → todos.
export type ExistingTodosByUser = Map<ModelId, ProjectTodoResource[]>;

// ── LLM tool ─────────────────────────────────────────────────────────────────

const REPORT_GROUPS_FUNCTION_NAME = "report_groups";

const DeduplicationResultSchema = z.object({
  groups: z.array(z.array(z.number().int())),
});

function buildDeduplicationSpec(): AgentActionSpecification {
  return {
    name: REPORT_GROUPS_FUNCTION_NAME,
    description:
      "Partition the numbered TODO items into semantic groups. Items in the same group describe the same underlying task.",
    inputSchema: {
      type: "object",
      properties: {
        groups: {
          type: "array",
          description:
            "Array of groups. Each group is an array of 0-based item indexes that represent the same underlying task. Every item must appear in exactly one group. Items with no duplicates form a group of size 1.",
          items: {
            type: "array",
            items: { type: "integer" },
          },
        },
      },
      required: ["groups"],
    },
  };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

// Presents existing todos and candidates in one flat, 0-indexed list. The LLM
// does not need to distinguish existing from new — it just groups. The caller
// partitions groups back into (existing, candidates) by index in
// resolveDeduplicationGroups.
function buildDeduplicationPrompt(
  existingTodos: ProjectTodoResource[],
  candidates: DeduplicateCandidate[]
): string {
  const lines: string[] = [];
  let i = 0;
  for (const t of existingTodos) {
    lines.push(`[${i}] ${t.text}`);
    i++;
  }
  for (const c of candidates) {
    lines.push(`[${i}] ${c.text}`);
    i++;
  }

  return [
    `Group TODO items that describe the same underlying task.`,
    "",
    "Two items are duplicates only if completing one would make the other",
    "redundant. If both could independently appear on a task list without",
    "overlap, they are distinct — even if they share keywords or domain.",
    "",
    "A more specific or more general version of the same task is still a",
    "duplicate if the core task is the same.",
    "",
    "When in doubt, put items in separate groups. A false merge loses data;",
    "a missed dedup just creates a minor duplicate that can be cleaned up",
    "later.",
    "",
    "Items:",
    lines.join("\n"),
    "",
    "Call report_groups with a partition of the indexes above. Every index",
    "must appear in exactly one group. Items with no duplicates form a",
    "group of size 1.",
  ].join("\n");
}

// ── LLM call for a single (userId, category) group ───────────────────────────

// Returns the LLM's partitioning of `[...existingTodos, ...candidates]` as
// an array of groups of 0-based indexes, or an empty array on failure (each
// candidate then ends up in its own singleton "new" group downstream).
// Precondition: all candidates must share the same category — batchDeduplicateCandidates
// enforces this by grouping on (userId, category) before calling here.
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
): Promise<number[][]> {
  const owner = auth.getNonNullableWorkspace();
  const prompt = buildDeduplicationPrompt(existingTodos, candidates);
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
            "You partition TODO items into semantic groups. Items in the same group describe the same underlying task. " +
            "Err on the side of separating items — only group them when clearly redundant.",
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
    return [];
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    logger.warn(
      { workspaceId: owner.sId },
      "Project todo dedup: no tool call in LLM response, treating all as new"
    );
    return [];
  }

  const parsed = DeduplicationResultSchema.safeParse(action.arguments);
  if (!parsed.success) {
    logger.warn(
      { error: parsed.error, workspaceId: owner.sId },
      "Project todo dedup: failed to parse LLM response, treating all as new"
    );
    return [];
  }

  return parsed.data.groups;
}

// ── Group resolution ─────────────────────────────────────────────────────────

// Generic over the todo type so unit tests can pass a minimal structural stub
// instead of a full ProjectTodoResource.
type ResolvedGroupOf<TTodo> =
  | { kind: "existing"; todo: TTodo; candidates: DeduplicateCandidate[] }
  | { kind: "new"; candidates: DeduplicateCandidate[] };

// Turns one LLM partition into a list of resolved groups. Pure so it can be
// unit-tested without a real LLM call.
//
// The input list the LLM grouped is `[...existingTodos, ...candidates]`:
// indexes in `[0, existingTodos.length)` refer to existing todos; indexes in
// `[existingTodos.length, existingTodos.length + candidates.length)` refer to
// candidates. Any index outside that range (LLM hallucination) is ignored.
// An index that appears in more than one group is honored only in the first
// group it appears in, so later groups don't silently re-assign it.
//
// Per-cluster resolution:
//   - No candidate → cluster dropped.
//   - ≥1 existing  → "existing" group pointing at the first existing (extras
//                    ignored).
//   - No existing  → "new" group (first candidate drives content).
//
// Any candidate the LLM forgot to place in a cluster is emitted as its own
// singleton "new" group so no source ever disappears.
export function resolveDeduplicationGroups<TTodo>(
  candidates: DeduplicateCandidate[],
  existingTodos: TTodo[],
  groups: number[][]
): Array<ResolvedGroupOf<TTodo>> {
  const result: Array<ResolvedGroupOf<TTodo>> = [];
  const existingCount = existingTodos.length;
  const totalCount = existingCount + candidates.length;
  const seen = new Set<number>();

  for (const group of groups) {
    const existingInGroup: TTodo[] = [];
    const candidatesInGroup: DeduplicateCandidate[] = [];

    for (const idx of group) {
      if (idx < 0 || idx >= totalCount || seen.has(idx)) {
        continue;
      }
      seen.add(idx);
      if (idx < existingCount) {
        existingInGroup.push(existingTodos[idx]);
      } else {
        candidatesInGroup.push(candidates[idx - existingCount]);
      }
    }

    if (candidatesInGroup.length === 0) {
      continue;
    }

    if (existingInGroup.length >= 1) {
      result.push({
        kind: "existing",
        todo: existingInGroup[0],
        candidates: candidatesInGroup,
      });
    } else {
      result.push({ kind: "new", candidates: candidatesInGroup });
    }
  }

  // Any candidate the LLM forgot to include ends up in its own singleton
  // "new" group — never silently dropped.
  for (let i = 0; i < candidates.length; i++) {
    if (!seen.has(existingCount + i)) {
      result.push({ kind: "new", candidates: [candidates[i]] });
    }
  }

  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

// Runs semantic deduplication for all new candidates. Groups candidates by
// (userId, category), executes one LLM call per group (up to 4 concurrent),
// and returns a flat list of DeduplicatedGroup covering every input
// candidate.
export async function batchDeduplicateCandidates(
  auth: Authenticator,
  {
    model,
    candidates,
    existingTodosByUser,
  }: {
    model: ModelConfigurationType;
    candidates: DeduplicateCandidate[];
    existingTodosByUser: ExistingTodosByUser;
  }
): Promise<DeduplicatedGroup[]> {
  const results: DeduplicatedGroup[] = [];

  // Group candidates by userId → candidates.
  // TODO: to move above, we are doing it for each batch this is wasteful
  const candidatesByUserId = new Map<ModelId, DeduplicateCandidate[]>();
  for (const candidate of candidates) {
    const bucket = candidatesByUserId.get(candidate.userId) ?? [];

    bucket.push(candidate);
    candidatesByUserId.set(candidate.userId, bucket);
  }

  // Flatten to a list of (candidates, existingTodos) jobs so the executor
  // can schedule them at a fixed parallelism.
  const jobs: Array<{
    candidates: DeduplicateCandidate[];
    existingTodos: ProjectTodoResource[];
  }> = [];
  for (const [userId, candidates] of candidatesByUserId) {
    const existingTodos = existingTodosByUser.get(userId) ?? [];
    jobs.push({ candidates, existingTodos });
  }

  await concurrentExecutor(
    jobs,
    async ({ candidates, existingTodos }) => {
      // Fast path: one candidate, no existing. No LLM call needed; emit a
      // singleton "new" group directly.
      if (existingTodos.length === 0 && candidates.length <= 1) {
        results.push({ kind: "new", candidates });
        return;
      }

      const llmGroups = await runDeduplicationLLMCall(auth, {
        model,
        candidates,
        existingTodos,
      });

      results.push(
        ...resolveDeduplicationGroups(candidates, existingTodos, llmGroups)
      );
    },
    { concurrency: 4 }
  );

  return results;
}
