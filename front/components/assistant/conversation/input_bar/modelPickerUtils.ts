import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import {
  AUTO_COMPLEX_MODEL_ID,
  AUTO_FAST_MODEL_ID,
  AUTO_MODEL_ID,
  isModelStreamId,
} from "@app/types/assistant/models/auto";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ModelSelectionType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import capitalize from "lodash/capitalize";

// The three primary picks of the model picker. Each tier is backed by a
// meta-model that is resolved to a concrete model at message-send time:
//   - Fast     -> auto_fast (curated pool of small, cheap models)
//   - Standard -> auto       (Dust picks any available model — the old "Auto")
//   - Complex  -> auto_complex  (curated pool of powerful models)
export type ModelTierId = "fast" | "standard" | "complex";

export interface ModelTierDefinition {
  id: ModelTierId;
  metaModelId: ModelStreamIdType;
  name: string;
  // Short right-aligned blurb shown next to the tier name.
  description: string;
}

export const MODEL_TIERS: ModelTierDefinition[] = [
  {
    id: "fast",
    metaModelId: AUTO_FAST_MODEL_ID,
    name: "Fast",
    description: "Quick, low cost",
  },
  {
    id: "standard",
    metaModelId: AUTO_MODEL_ID,
    name: "Standard",
    description: "Best for most",
  },
  {
    id: "complex",
    metaModelId: AUTO_COMPLEX_MODEL_ID,
    name: "Complex",
    description: "Slower, most capable",
  },
];

const TIER_BY_META_MODEL_ID: Record<ModelStreamIdType, ModelTierId> = {
  [AUTO_FAST_MODEL_ID]: "fast",
  [AUTO_MODEL_ID]: "standard",
  [AUTO_COMPLEX_MODEL_ID]: "complex",
};

export function getModelTier(tierId: ModelTierId): ModelTierDefinition {
  // MODEL_TIERS is exhaustive over ModelTierId, so a match is guaranteed; the
  // fallback to the "standard" tier is dead today and only guards against a
  // future tier being removed from the list.
  return (
    MODEL_TIERS.find((tier) => tier.id === tierId) ??
    MODEL_TIERS.find((tier) => tier.id === "standard") ??
    MODEL_TIERS[0]
  );
}

// Per reasoning-effort blurbs surfaced in the effort slider tooltip.
export const REASONING_EFFORT_INFO: Record<ReasoningEffort, string> = {
  none: "No additional reasoning, for the fastest responses.",
  light: "Light reasoning effort, faster responses.",
  medium: "Medium reasoning effort, balancing speed and quality.",
  high: "High reasoning effort, longer wait times but higher quality.",
};

export function getReasoningEffortLabel(effort: ReasoningEffort): string {
  return effort === "none" ? "None" : capitalize(effort);
}

// What the picker is currently showing, decoupled from the payload we send:
// a tier or a concrete model + reasoning effort.
export type SelectionDisplay =
  | { kind: "tier"; tierId: ModelTierId }
  | { kind: "model"; model: ModelConfigurationType; effort: ReasoningEffort };

// A resolved picker selection. `toSend` is `undefined` when the selection is
// the untouched agent default: we then send no override and let the backend use
// the agent's own configured model/effort.
export interface Selection {
  display: SelectionDisplay;
  toSend: ModelSelectionType | undefined;
}

export interface MakerGroup {
  makerId: ModelMakerIdType;
  models: ModelConfigurationType[];
}

// One stop of the reasoning-effort slider. A stop is `locked` when the level is
// not selectable — either the model does not support it natively, or the
// workspace's tier does not grant access to it.
export interface EffortStop {
  effort: ReasoningEffort;
  locked: boolean;
}

// The reasoning-effort slider always presents these three canonical levels so
// its shape stays consistent across models. "none" is not a level here: it
// means "no reasoning" and is never a selectable slider position.
const SLIDER_EFFORTS: ReasoningEffort[] = ["light", "medium", "high"];

export function buildTierSelection(tierId: ModelTierId): ModelSelectionType {
  const { metaModelId } = getModelTier(tierId);
  return {
    providerId: metaModelId,
    modelId: metaModelId,
    reasoningEffort: "none",
  };
}

export function buildModelSelection(
  model: ModelConfigurationType,
  effort: ReasoningEffort
): ModelSelectionType {
  return {
    providerId: model.providerId,
    modelId: model.modelId,
    reasoningEffort: effort,
  };
}

export function getModelKey(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

export function isModelSelection(
  model: ModelConfigurationType,
  display: SelectionDisplay
): boolean {
  return (
    display.kind === "model" &&
    display.model.providerId === model.providerId &&
    display.model.modelId === model.modelId
  );
}

export function isTierDisplayed(
  tierId: ModelTierId,
  display: SelectionDisplay
): boolean {
  return display.kind === "tier" && display.tierId === tierId;
}

// Display equality ignoring reasoning effort: two model displays for the same
// model are "the same" regardless of effort. Used to highlight the selected row
// and to mark the default, where effort is surfaced by the slider instead.
export function isSameDisplay(
  a: SelectionDisplay,
  b: SelectionDisplay
): boolean {
  if (a.kind === "tier" && b.kind === "tier") {
    return a.tierId === b.tierId;
  }
  if (a.kind === "model" && b.kind === "model") {
    return (
      a.model.providerId === b.model.providerId &&
      a.model.modelId === b.model.modelId
    );
  }
  return false;
}

// Full selection equality, effort included. Used to decide whether the active
// selection is exactly the agent default (so no override needs to be kept, and
// the revert affordance is hidden).
export function isSameSelection(
  a: SelectionDisplay,
  b: SelectionDisplay
): boolean {
  if (a.kind === "model" && b.kind === "model") {
    return isSameDisplay(a, b) && a.effort === b.effort;
  }
  return isSameDisplay(a, b);
}

// Always returns the three canonical levels (Light/Medium/High) so the slider looks
// the same across models. Levels the workspace's tier does not grant (already narrowed
// in `enabledModel`) are flagged `locked` (padlock); non-reasoning models get all three.
export function getEffortStops(
  enabledModel: ModelConfigurationType
): EffortStop[] {
  const allowed = new Set(
    getAvailableReasoningEfforts(enabledModel.supportedReasoningEfforts)
  );
  // Todo(models_picker): return reason for each stop (model does not support
  // or workspace tier does not grant)

  return SLIDER_EFFORTS.map((effort) => ({
    effort,
    locked: !allowed.has(effort),
  }));
}

// The reasoning effort to use when a model is freshly selected: its default when
// that is allowed, otherwise the first unlocked stop.
export function getInitialEffort(
  enabledModel: ModelConfigurationType
): ReasoningEffort {
  const stops = getEffortStops(enabledModel);
  const preferred = stops.find(
    (stop) =>
      stop.effort === enabledModel.defaultReasoningEffort && !stop.locked
  );
  if (preferred) {
    return preferred.effort;
  }
  return stops.find((stop) => !stop.locked)?.effort ?? "none";
}

export function getModelWithReasoningEffortLabel(
  display: SelectionDisplay
): string {
  switch (display.kind) {
    case "tier":
      return getModelTier(display.tierId).name;
    case "model": {
      const { model, effort } = display;
      return effort === "none"
        ? model.displayName
        : `${model.displayName} ${capitalize(effort)}`;
    }
    default:
      assertNeverAndIgnore(display);
      return "";
  }
}

function findAvailableModel(
  models: ModelConfigurationType[],
  selection: { providerId: string; modelId: string }
): ModelConfigurationType | undefined {
  return models.find(
    (m) =>
      m.providerId === selection.providerId && m.modelId === selection.modelId
  );
}

function findAgentModel(
  models: ModelConfigurationType[],
  agentModel: AgentModelConfigurationType
): ModelConfigurationType | undefined {
  return (
    findAvailableModel(models, agentModel) ??
    getSupportedModelConfig(agentModel) ??
    undefined
  );
}

export function resolveRequestedSelection(
  models: ModelConfigurationType[],
  selection: ModelSelectionType | null | undefined
): Selection | null {
  if (!selection) {
    return null;
  }
  if (isModelStreamId(selection.modelId)) {
    const tierId = TIER_BY_META_MODEL_ID[selection.modelId];
    return {
      display: { kind: "tier", tierId },
      toSend: buildTierSelection(tierId),
    };
  }
  const model = findAvailableModel(models, selection);
  if (!model) {
    return null;
  }
  const effort = selection.reasoningEffort ?? getInitialEffort(model);
  return {
    display: { kind: "model", model, effort },
    toSend: buildModelSelection(model, effort),
  };
}

export function resolveAgentDefault({
  agentModel,
  models,
}: {
  agentModel: AgentModelConfigurationType | null;
  models: ModelConfigurationType[];
}): Selection {
  const standardDefault: Selection = {
    display: { kind: "tier", tierId: "standard" },
    toSend: undefined,
  };
  if (!agentModel) {
    return standardDefault;
  }
  if (isModelStreamId(agentModel.modelId)) {
    return {
      display: {
        kind: "tier",
        tierId: TIER_BY_META_MODEL_ID[agentModel.modelId],
      },
      toSend: undefined,
    };
  }
  const model = findAgentModel(models, agentModel);
  if (!model) {
    return standardDefault;
  }

  const effort = agentModel.reasoningEffort ?? getInitialEffort(model);
  return {
    display: { kind: "model", model, effort },
    toSend: undefined,
  };
}

// The selection to show, in precedence order: last-requested (per-conversation)
// > session sticky > agent default. The agent default is returned separately so
// callers can mark it "(Default)" and offer a revert affordance.
export function resolveShownSelection({
  agentModel,
  lastRequestedModel,
  sessionSticky,
  models,
}: {
  agentModel: AgentModelConfigurationType | null;
  lastRequestedModel: ModelSelectionType | null;
  sessionSticky?: ModelSelectionType | null;
  models: ModelConfigurationType[];
}): { shown: Selection; agentDefault: Selection } {
  const agentDefault = resolveAgentDefault({ agentModel, models });
  const shown =
    resolveRequestedSelection(models, lastRequestedModel) ??
    resolveRequestedSelection(models, sessionSticky) ??
    agentDefault;
  return { shown, agentDefault };
}
