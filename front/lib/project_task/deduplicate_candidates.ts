// Semantic deduplication for project TASK candidates during the merge workflow.
//
// batchDeduplicateCandidates receives ALL candidates and ALL existing tasks for
// the space (across all users), runs ONE LLM call, and returns a flat list of
// DeduplicatedGroup. Each group describes one task that Phase 3 will touch:
//
//   - { kind: "existing", task, candidates }
//       Attach every candidate's source to the existing task.
//   - { kind: "new", candidates }
//       Create one new task using the first candidate's content, then attach
//       every candidate's source to it.
//
// Every input candidate ends up in exactly one DeduplicatedGroup: if the LLM
// forgets to include it in any partition, it is emitted as a singleton
// "new" group so sources are never silently dropped.
//
// The LLM is handed one flat, numbered list — existing tasks first, then new
// candidates — and asked to partition it into semantic clusters. Per cluster:
//
//   - no existing → the cluster becomes one "new" group; the first candidate
//     drives the content, the rest attach their sources;
//   - ≥1 existing → the cluster becomes an "existing" group pointing at the
//     first existing task; every candidate attaches its source to it. Any
//     additional existing tasks in the same cluster are ignored (we don't
//     merge existing tasks here).
//
// On LLM failure the whole call is treated as all-new (one singleton "new"
// group per candidate), so the caller always falls back to creating fresh tasks
// rather than silently discarding data.

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { Authenticator } from "@app/lib/auth";
import type { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import { startActiveObservation, updateActiveTrace } from "@langfuse/tracing";
import type { Logger } from "pino";
import { z } from "zod";

// ── Public types ──────────────────────────────────────────────────────────────

export type DeduplicateCandidate = {
  itemId: string;
  userId: ModelId;
  text: string;
};

// One task that Phase 3 will touch.
export type DeduplicatedGroup =
  | {
      kind: "existing";
      task: ProjectTaskResource;
      candidates: DeduplicateCandidate[];
    }
  | {
      kind: "new";
      // Non-empty. candidates[0] drives the new task's content; later entries
      // attach their sources to that task.
      candidates: DeduplicateCandidate[];
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
      "Partition the numbered TASK items into semantic groups. Items in the same group describe the same underlying task.",
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

// Presents existing tasks and candidates in one flat, 0-indexed list. The LLM
// does not need to distinguish existing from new — it just groups. The caller
// partitions groups back into (existing, candidates) by index in
// resolveDeduplicationGroups.
function buildDeduplicationPrompt(
  existingTasks: ProjectTaskResource[],
  candidates: DeduplicateCandidate[]
): string {
  const lines: string[] = [];
  let i = 0;
  for (const t of existingTasks) {
    lines.push(`[${i}] ${t.text}`);
    i++;
  }
  for (const c of candidates) {
    lines.push(`[${i}] ${c.text}`);
    i++;
  }

  return [
    `Group TASK items that describe the same underlying task.`,
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

// Returns the LLM's partitioning of `[...existingTasks, ...candidates]` as
// an array of groups of 0-based indexes, or an empty array on failure (each
// candidate then ends up in its own singleton "new" group downstream).
export async function runDeduplicationLLMCall(
  auth: Authenticator,
  {
    localLogger,
    runId,
    model,
    candidates,
    existingTasks,
  }: {
    localLogger: Logger;
    runId: string;
    model: ModelConfigurationType;
    candidates: DeduplicateCandidate[];
    existingTasks: ProjectTaskResource[];
  }
): Promise<number[][]> {
  const owner = auth.getNonNullableWorkspace();
  const prompt = buildDeduplicationPrompt(existingTasks, candidates);
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
    "project-task-deduplicate-candidates",
    (span) => {
      updateActiveTrace({ sessionId: runId });
      localLogger.info(
        { langfuseSpanId: span.id },
        "Project task dedup: LLM call started"
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
            "You partition TASK items into semantic groups. Items in the same group describe the same underlying task. " +
            "Err on the side of separating items — only group them when clearly redundant.",
          specifications: [specification],
          forceToolCall: specification.name,
        },
        {
          context: {
            operationType: "project_task_deduplicate_candidates",
            workspaceId: owner.sId,
          },
        }
      );
    }
  );

  if (res.isErr()) {
    localLogger.warn(
      { error: res.error, workspaceId: owner.sId },
      "Project task dedup: LLM call failed, treating all candidates as new"
    );
    return [];
  }

  const action = res.value.actions?.[0];
  if (!action?.arguments) {
    localLogger.warn(
      { workspaceId: owner.sId },
      "Project task dedup: no tool call in LLM response, treating all as new"
    );
    return [];
  }

  const parsed = DeduplicationResultSchema.safeParse(action.arguments);
  if (!parsed.success) {
    localLogger.warn(
      { error: parsed.error, workspaceId: owner.sId },
      "Project task dedup: failed to parse LLM response, treating all as new"
    );
    return [];
  }

  return parsed.data.groups;
}

// ── Group resolution ─────────────────────────────────────────────────────────

// Generic over the task type so unit tests can pass a minimal structural stub
// instead of a full ProjectTaskResource.
type ResolvedGroupOf<TTask> =
  | { kind: "existing"; task: TTask; candidates: DeduplicateCandidate[] }
  | { kind: "new"; candidates: DeduplicateCandidate[] };

// Turns one LLM partition into a list of resolved groups. Pure so it can be
// unit-tested without a real LLM call.
//
// The input list the LLM grouped is `[...existingTasks, ...candidates]`:
// indexes in `[0, existingTasks.length)` refer to existing tasks; indexes in
// `[existingTasks.length, existingTasks.length + candidates.length)` refer to
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
export function resolveDeduplicationGroups<TTask>(
  candidates: DeduplicateCandidate[],
  existingTasks: TTask[],
  groups: number[][]
): Array<ResolvedGroupOf<TTask>> {
  const result: Array<ResolvedGroupOf<TTask>> = [];
  const existingCount = existingTasks.length;
  const totalCount = existingCount + candidates.length;
  const seen = new Set<number>();

  for (const group of groups) {
    const existingInGroup: TTask[] = [];
    const candidatesInGroup: DeduplicateCandidate[] = [];

    for (const idx of group) {
      if (idx < 0 || idx >= totalCount || seen.has(idx)) {
        continue;
      }
      seen.add(idx);
      if (idx < existingCount) {
        existingInGroup.push(existingTasks[idx]);
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
        task: existingInGroup[0],
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
// All candidates and all existing tasks (across all users) are presented to the
// model as one flat numbered list. Returns a flat list of DeduplicatedGroup
// covering every input candidate.
//
// Fast path: if there is at most one candidate and no existing tasks, the LLM
// call is skipped and a singleton "new" group is returned directly.
//
// On LLM failure every candidate is returned as its own singleton "new" group
// so the caller always creates fresh tasks rather than silently dropping data.
export async function batchDeduplicateCandidates(
  auth: Authenticator,
  {
    localLogger,
    runId,
    model,
    candidates,
    existingTasks,
  }: {
    localLogger: Logger;
    runId: string;
    model: ModelConfigurationType;
    candidates: DeduplicateCandidate[];
    existingTasks: ProjectTaskResource[];
  }
): Promise<DeduplicatedGroup[]> {
  if (candidates.length === 0) {
    return [];
  }

  const owner = auth.getNonNullableWorkspace();

  // Fast path: single candidate with no existing tasks needs no LLM call.
  if (existingTasks.length === 0 && candidates.length === 1) {
    return [{ kind: "new", candidates }];
  }

  const totalItems = existingTasks.length + candidates.length;

  if (totalItems > CONTEXT_PRESSURE_THRESHOLD) {
    localLogger.warn(
      {
        workspaceId: owner.sId,
        existingTaskCount: existingTasks.length,
        candidateCount: candidates.length,
        totalItems,
        threshold: CONTEXT_PRESSURE_THRESHOLD,
      },
      "Project task dedup: large combined item count may cause context pressure — proceeding with single LLM call"
    );
  } else {
    localLogger.info(
      {
        workspaceId: owner.sId,
        existingTaskCount: existingTasks.length,
        candidateCount: candidates.length,
        totalItems,
      },
      "Project task dedup: running single LLM call for all users"
    );
  }

  const llmGroups = await runDeduplicationLLMCall(auth, {
    localLogger,
    runId,
    model,
    candidates,
    existingTasks,
  });

  return resolveDeduplicationGroups(candidates, existingTasks, llmGroups);
}
