import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import type {
  ModelSuggestionType,
  SuggestionPayload,
} from "@app/types/suggestions/agent_suggestion";
import { Op } from "sequelize";

// Before this migration, the reasoning effort stored on an agent configuration was not always the
// one its model ran at. The router remapped it on every request:
//
// - an effort missing from the model's legacy supported efforts was clamped to its lowest supported
//   one (e.g. `none` on Claude Sonnet 5 ran at `low`);
// - `light` ran at `low` on models with native light reasoning, and with thinking off plus a
//   chain-of-thought prompt on the others (e.g. Claude Haiku 4.5);
// - per-model parsers rewrote the result: Kimi K3, GLM-5.3, GLM-5.3 Flash and DeepSeek V4.1 Flash
//   folded `medium` onto `high` and `high` onto `maximal`, DeepSeek V4 Pro always ran at
//   `high`, and Gemini 3.5 Flash-Lite and 3.6 Flash ran `none` as `minimal`;
// - a null effort ran at the model's default effort, itself remapped as above.
//
// The router now sends the stored effort as is, so every stored effort is rewritten to the one its
// agent actually ran at. A null effort is pinned too: model defaults now follow each provider's
// documented default, and an existing agent must keep running where it did.
//
// Frozen snapshot, recorded from the router right before the change: for each model it serves, the
// effort the provider received for each stored value, "unset" being a null effort. Hardcoded on
// purpose so this migration keeps its meaning whatever the model configs become.
//
// One deliberate exception: Claude Haiku 4.5 at `light` (or unset) ran with thinking off plus a
// chain-of-thought prompt, which is gone. Native `low` thinking is its closest equivalent.
const STORED_EFFORTS = ["none", "light", "medium", "high"] as const;
type StoredEffort = (typeof STORED_EFFORTS)[number];

const EFFECTIVE_REASONING_EFFORT_BY_MODEL: Record<
  string,
  Record<StoredEffort | "unset", ReasoningEffort>
> = {
  "claude-haiku-4-5-20251001": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "claude-opus-5": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-opus-5-5": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-opus-4-8": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-opus-4-7": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-opus-4-6": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-sonnet-5": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-sonnet-4-6": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gemini-3.5-flash": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "gemini-3.6-flash": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "gemini-3.7-flash": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "gemini-3.8-flash": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gemini-3.1-flash-lite": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "gemini-3.5-flash-lite": {
    none: "minimal",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "gemini-3.1-pro-preview": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "low",
  },
  "claude-fable-5": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "claude-fable-5-1": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "high",
  },
  "accounts/fireworks/models/deepseek-v4-pro": {
    none: "high",
    light: "high",
    medium: "high",
    high: "high",
    unset: "high",
  },
  "accounts/fireworks/models/deepseek-v4p1-flash": {
    none: "none",
    light: "low",
    medium: "high",
    high: "maximal",
    unset: "low",
  },
  "accounts/fireworks/models/glm-5p3": {
    none: "low",
    light: "low",
    medium: "high",
    high: "maximal",
    unset: "maximal",
  },
  "accounts/fireworks/models/glm-5p3-flash": {
    none: "low",
    light: "low",
    medium: "high",
    high: "maximal",
    unset: "low",
  },
  "accounts/fireworks/models/kimi-k3": {
    none: "low",
    light: "low",
    medium: "high",
    high: "maximal",
    unset: "low",
  },
  "accounts/fireworks/models/inkling": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "high",
  },
  "codestral-latest": {
    none: "none",
    light: "none",
    medium: "none",
    high: "none",
    unset: "none",
  },
  "mistral-large-latest": {
    none: "none",
    light: "none",
    medium: "none",
    high: "none",
    unset: "none",
  },
  "mistral-medium-3-5": {
    none: "none",
    light: "none",
    medium: "none",
    high: "high",
    unset: "none",
  },
  "mistral-small-latest": {
    none: "none",
    light: "none",
    medium: "none",
    high: "none",
    unset: "none",
  },
  noop: {
    none: "none",
    light: "none",
    medium: "none",
    high: "none",
    unset: "none",
  },
  "simulated-failure-model": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.5": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.4-mini": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.4-nano": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.4": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.1": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.6-luna": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-6-astra": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-6-luna": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-6-sol": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.6-sol": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.6-terra": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.6-terra-long-context": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5.2": {
    none: "none",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5-mini": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5-nano": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "gpt-5": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "medium",
  },
  "grok-4.5": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "high",
  },
  "grok-4.6": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "high",
  },
  "grok-4.7": {
    none: "low",
    light: "low",
    medium: "medium",
    high: "high",
    unset: "high",
  },
};

// Agent configurations are versioned: a save writes a new row. Rows created after `cutoff` (the
// end of the deploy that stops remapping) already use the new vocabulary and must be left alone.
// This is also why the script must only be executed once: a second run would remap rows it has
// already rewritten (e.g. Kimi K3 `medium` -> `high` -> `maximal`).
const PAGE_SIZE = 5_000;
const UPDATE_CONCURRENCY = 4;

function isStoredEffort(effort: string): effort is StoredEffort {
  return STORED_EFFORTS.some((storedEffort) => storedEffort === effort);
}

// The effort to store for an agent on `modelId` whose stored effort is `storedEffort`, or
// `undefined` to leave it as is. Models the router does not serve cannot run, so only the rename of
// `light` to `low` applies to them.
export function getMigratedReasoningEffort(
  modelId: string,
  storedEffort: string | null
): ReasoningEffort | undefined {
  const efforts = EFFECTIVE_REASONING_EFFORT_BY_MODEL[modelId];
  if (!efforts) {
    return storedEffort === "light" ? "low" : undefined;
  }
  if (storedEffort === null) {
    return efforts.unset;
  }
  return isStoredEffort(storedEffort) ? efforts[storedEffort] : undefined;
}

type ReasoningEffortChange = {
  id: number;
  modelId: string;
  from: string | null;
  to: ReasoningEffort;
};

function countChanges(
  changes: ReasoningEffortChange[]
): Record<string, number> {
  return changes.reduce<Record<string, number>>(
    (acc, { modelId, from, to }) => {
      const key = `${modelId}: ${from ?? "null"} -> ${to}`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {}
  );
}

const AgentConfigurationModelWithBypass: ModelStaticWorkspaceAware<AgentConfigurationModel> =
  AgentConfigurationModel;
const AgentSuggestionModelWithBypass: ModelStaticWorkspaceAware<AgentSuggestionModel> =
  AgentSuggestionModel;

type AgentConfigurationRow = {
  id: number;
  modelId: string;
  reasoningEffort: string | null;
};

async function findAgentConfigurationChanges(
  cutoff: Date
): Promise<ReasoningEffortChange[]> {
  const changes: ReasoningEffortChange[] = [];
  let lastId = 0;
  // Sequential on purpose: each page starts after the last id of the previous one.
  for (;;) {
    // `raw` reads the stored value: the model's getter would already read "light" as "low".
    const rows: AgentConfigurationRow[] =
      await AgentConfigurationModelWithBypass.findAll({
        attributes: ["id", "modelId", "reasoningEffort"],
        where: { id: { [Op.gt]: lastId }, createdAt: { [Op.lt]: cutoff } },
        order: [["id", "ASC"]],
        limit: PAGE_SIZE,
        raw: true,
        // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
        // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
        dangerouslyBypassWorkspaceIsolationSecurity: true,
      });
    const lastRow = rows.at(-1);
    if (!lastRow) {
      return changes;
    }
    lastId = lastRow.id;

    for (const { id, modelId, reasoningEffort } of rows) {
      const to = getMigratedReasoningEffort(modelId, reasoningEffort);
      if (to !== undefined && to !== reasoningEffort) {
        changes.push({ id, modelId, from: reasoningEffort, to });
      }
    }
  }
}

type SuggestionRow = {
  id: number;
  suggestion: SuggestionPayload;
};

type SuggestionChange = ReasoningEffortChange & {
  suggestion: ModelSuggestionType;
};

function isModelSuggestion(
  suggestion: SuggestionPayload
): suggestion is ModelSuggestionType {
  return "modelId" in suggestion && !("name" in suggestion);
}

// Pending model suggestions carry the effort they will apply. One without an effort applies the
// model's default at that time, so it is left as is.
async function findPendingSuggestionChanges(
  cutoff: Date
): Promise<SuggestionChange[]> {
  const rows: SuggestionRow[] = await AgentSuggestionModelWithBypass.findAll({
    attributes: ["id", "suggestion"],
    where: { kind: "model", state: "pending", createdAt: { [Op.lt]: cutoff } },
    raw: true,
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  return rows.flatMap(({ id, suggestion }) => {
    if (!isModelSuggestion(suggestion) || !suggestion.reasoningEffort) {
      return [];
    }
    const from = suggestion.reasoningEffort;
    const to = getMigratedReasoningEffort(suggestion.modelId, from);
    return to === undefined || to === from
      ? []
      : [{ id, modelId: suggestion.modelId, from, to, suggestion }];
  });
}

export type MigrateReasoningEffortsParams = {
  // End of the deploy that stops remapping efforts; later rows are left alone.
  cutoff: Date;
  execute: boolean;
  logger: Logger;
};

export async function migrateReasoningEfforts({
  cutoff,
  execute,
  logger,
}: MigrateReasoningEffortsParams): Promise<void> {
  const agentChanges = await findAgentConfigurationChanges(cutoff);
  const suggestionChanges = await findPendingSuggestionChanges(cutoff);

  logger.info(
    {
      agentConfigurations: agentChanges.length,
      byModelAndEffort: countChanges(agentChanges),
    },
    "Agent configuration reasoning efforts to rewrite."
  );
  logger.info(
    {
      pendingSuggestions: suggestionChanges.length,
      byModelAndEffort: countChanges(suggestionChanges),
    },
    "Pending model suggestion reasoning efforts to rewrite."
  );

  if (!execute) {
    return;
  }

  // One batched UPDATE per target effort and page of ids.
  const idsByEffort = new Map<ReasoningEffort, number[]>();
  for (const { id, to } of agentChanges) {
    idsByEffort.set(to, [...(idsByEffort.get(to) ?? []), id]);
  }
  const agentUpdates = [...idsByEffort].flatMap(([reasoningEffort, ids]) =>
    chunk(ids, PAGE_SIZE).map((pageIds) => ({ reasoningEffort, ids: pageIds }))
  );
  await concurrentExecutor(
    agentUpdates,
    ({ reasoningEffort, ids }) =>
      AgentConfigurationModelWithBypass.update(
        { reasoningEffort },
        { where: { id: ids } }
      ),
    { concurrency: UPDATE_CONCURRENCY }
  );

  await concurrentExecutor(
    suggestionChanges,
    ({ id, suggestion, to }) =>
      AgentSuggestionModelWithBypass.update(
        { suggestion: { ...suggestion, reasoningEffort: to } },
        { where: { id } }
      ),
    { concurrency: UPDATE_CONCURRENCY }
  );

  logger.warn(
    "Reasoning efforts migrated. Do not execute this script again: it would remap them twice."
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );
}

// Only run when executed directly: the test imports `getMigratedReasoningEffort` from this module.
if (
  process.argv[1]?.endsWith(
    "20260924_migrate_reasoning_effort_to_router_vocabulary.ts"
  )
) {
  makeScript(
    {
      cutoff: {
        type: "string",
        required: true,
        description:
          "ISO timestamp at which the deploy that stops remapping efforts finished",
      },
    },
    async ({ cutoff, execute }, logger) => {
      const cutoffDate = new Date(cutoff);
      if (Number.isNaN(cutoffDate.getTime())) {
        throw new Error(`Invalid --cutoff timestamp: ${cutoff}`);
      }
      await migrateReasoningEfforts({ cutoff: cutoffDate, execute, logger });
    }
  );
}
