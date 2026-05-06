// Semantic deduplication for project TODO candidates during the merge workflow.
//
// batchDeduplicateCandidates receives ALL candidates and ALL existing todos for
// the space (across all users), runs ONE LLM call, and returns a flat list of
// DeduplicatedGroup. Each group describes one todo that Phase 3 will touch:
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
// The LLM is handed one flat, numbered list — existing todos first, then new
// candidates — and asked to partition it into semantic clusters. Per cluster:
//
//   - no existing → the cluster becomes one "new" group; the first candidate
//     drives the content, the rest attach their sources;
//   - ≥1 existing → the cluster becomes an "existing" group pointing at the
//     first existing todo; every candidate attaches its source to it. Any
//     additional existing todos in the same cluster are ignored (we don't
//     merge existing todos here).
//
// On LLM failure the whole call is treated as all-new (one singleton "new"
// group per candidate), so the caller always falls back to creating fresh todos
// rather than silently discarding data.

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import { startActiveObservation } from "@langfuse/tracing";
import type { Logger } from "pino";
import { z } from "zod";

// ── Public types ──────────────────────────────────────────────────────────────

export type DeduplicateCandidate = {
  itemId: string;
  userId: ModelId;
  text: string;
};

// One task that Phase 3 will touch. `scopedLogger` carries the langfuseSpanId
// of the LLM call that produced the group (or the unscoped logger when no LLM
// call was made).
export type DeduplicatedGroup =
  | {
      kind: "existing";
      todo: ProjectTaskResource;
      candidates: DeduplicateCandidate[];
      scopedLogger: Logger;
    }
  | {
      kind: "new";
      // Non-empty. candidates[0] drives the new todo's content; later entries
      // attach their sources to that todo.
      candidates: DeduplicateCandidate[];
      scopedLogger: Logger;
    };

// ── LLM tool ─────────────────────────────────────────────────────────────────

const REPORT_GROUPS_FUNCTION_NAME = "report_groups";

// Warn when combined item count risks context pressure. The LLM call still
// fires — this is purely a signal for monitoring.
// 500 * 256 = 128k
const CONTEXT_PRESSURE_THRESHOLD = 500;

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
  existingTodos: ProjectTaskResource[],
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

// ── LLM call ─────────────────────────────────────────────────────────────────

// Returns the LLM's partitioning of `[...existingTodos, ...candidates]` as
// an array of groups of 0-based indexes, or an empty array on failure (each
// candidate then ends up in its own singleton "new" group downstream).
export async function runDeduplicationLLMCall(
  auth: Authenticator,
  {
    localLogger,
    model,
    candidates,
    existingTodos,
  }: {
    localLogger: Logger;
    model: ModelConfigurationType;
    candidates: DeduplicateCandidate[];
    existingTodos: ProjectTaskResource[];
  }
): Promise<{ groups: number[][]; scopedLogger: Logger }> {
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

  let scopedLogger = localLogger;
  const res = await startActiveObservation(
    "project-todo-deduplicate-candidates",
    (span) => {
      scopedLogger = localLogger.child({ langfuseSpanId: span.id });
      scopedLogger.info(
        { workspaceId: owner.sId },
        "Project todo dedup: LLM call started"
      );

      return runMultiActionsAgent(
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
      );
    }
  );

  if (res.isErr()) {
    scopedLogger.warn(
      { error: res.error, workspaceId: owner.sId },
      "Project todo dedup: LLM call failed, treating all candidates as new"
    );
    return { groups: [], scopedLogger };
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    scopedLogger.warn(
      { workspaceId: owner.sId },
      "Project todo dedup: no tool call in LLM response, treating all as new"
    );
    return { groups: [], scopedLogger };
  }

  const parsed = DeduplicationResultSchema.safeParse(action.arguments);
  if (!parsed.success) {
    scopedLogger.warn(
      { error: parsed.error, workspaceId: owner.sId },
      "Project todo dedup: failed to parse LLM response, treating all as new"
    );
    return { groups: [], scopedLogger };
  }

  return { groups: parsed.data.groups, scopedLogger };
}

// ── Group resolution ─────────────────────────────────────────────────────────

// Generic over the todo type so unit tests can pass a minimal structural stub
// instead of a full ProjectTaskResource.
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

// Runs semantic deduplication for all new candidates in a single LLM call.
// All candidates and all existing todos (across all users) are presented to the
// model as one flat numbered list. Returns a flat list of DeduplicatedGroup
// covering every input candidate.
//
// Fast path: if there is at most one candidate and no existing todos, the LLM
// call is skipped and a singleton "new" group is returned directly.
//
// On LLM failure every candidate is returned as its own singleton "new" group
// so the caller always creates fresh todos rather than silently dropping data.
export async function batchDeduplicateCandidates(
  auth: Authenticator,
  {
    localLogger,
    model,
    candidates,
    existingTodos,
  }: {
    localLogger: Logger;
    model: ModelConfigurationType;
    candidates: DeduplicateCandidate[];
    existingTodos: ProjectTaskResource[];
  }
): Promise<DeduplicatedGroup[]> {
  if (candidates.length === 0) {
    return [];
  }

  const owner = auth.getNonNullableWorkspace();

  // Fast path: single candidate with no existing todos needs no LLM call.
  if (existingTodos.length === 0 && candidates.length === 1) {
    return [{ kind: "new", candidates, scopedLogger: localLogger }];
  }

  const totalItems = existingTodos.length + candidates.length;

  if (totalItems > CONTEXT_PRESSURE_THRESHOLD) {
    localLogger.warn(
      {
        workspaceId: owner.sId,
        existingTodoCount: existingTodos.length,
        candidateCount: candidates.length,
        totalItems,
        threshold: CONTEXT_PRESSURE_THRESHOLD,
      },
      "Project todo dedup: large combined item count may cause context pressure — proceeding with single LLM call"
    );
  } else {
    localLogger.info(
      {
        workspaceId: owner.sId,
        existingTodoCount: existingTodos.length,
        candidateCount: candidates.length,
        totalItems,
      },
      "Project todo dedup: running single LLM call for all users"
    );
  }

  const { groups: llmGroups, scopedLogger } = await runDeduplicationLLMCall(
    auth,
    {
      localLogger,
      model,
      candidates,
      existingTodos,
    }
  );

  return resolveDeduplicationGroups(candidates, existingTodos, llmGroups).map(
    (group) => ({ ...group, scopedLogger })
  );
}
