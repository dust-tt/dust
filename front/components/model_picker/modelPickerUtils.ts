import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import type {
  EnabledModelConfigurationType,
  ModelSelectionAvailabilityType,
  ModelSelectionLockReason,
  ModelStreamResolutionsType,
  ReasoningEffortSelectionAvailabilityType,
} from "@app/types/api/assistant/models";
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
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import capitalize from "lodash/capitalize";

// Shown when a model or reasoning effort is locked by the workspace plan.
export const WORKSPACE_PLAN_LOCKED_TOOLTIP =
  "This option isn't available on your workspace's current plan. " +
  "Contact your administrator to upgrade.";

// Shown when a model or reasoning effort is outside the model access granted
// through the workspace, a group, or the member directly.
const MODEL_ACCESS_LOCKED_TOOLTIP =
  "Your current model access doesn't include this option. " +
  "Contact your administrator to get access.";

export const DEGRADED_MODEL_TOOLTIP =
  "This model is currently degraded following an incident on the provider side. " +
  "Answers may be slower or fail — consider picking another model.";

// The three primary picks of the model picker. Each tier is backed by a
// meta-model that is resolved to a concrete model at message-send time. Tier ids
// keep the meta-model wording; `name` is what users see:
//   - "Basic"     -> auto_fast (curated pool of small, cheap models)
//   - "Standard"  -> auto       (Dust picks any available model — the old "Auto")
//   - "Premium"   -> auto_complex  (curated pool of powerful models)
export type ModelTierId = "fast" | "standard" | "complex";

export interface ModelTierDefinition {
  id: ModelTierId;
  metaModelId: ModelStreamIdType;
  name: string;
}

export const MODEL_TIERS: ModelTierDefinition[] = [
  {
    id: "fast",
    metaModelId: AUTO_FAST_MODEL_ID,
    name: "Basic",
  },
  {
    id: "standard",
    metaModelId: AUTO_MODEL_ID,
    name: "Standard",
  },
  {
    id: "complex",
    metaModelId: AUTO_COMPLEX_MODEL_ID,
    name: "Premium",
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

export function getTierLockReason(
  tierId: ModelTierId,
  streamModels: EnabledModelConfigurationType[]
): ModelLockReason | null {
  const { metaModelId } = getModelTier(tierId);
  const streamModel = streamModels.find(
    (model) => model.modelId === metaModelId
  );
  // Absent means we can't tell yet: the tier rows render before the models
  // payload lands (`useModels` returns an empty list while it is in flight), so
  // locking on absence would flash every row locked on each open. Default to
  // unlocked — the server refuses an out-of-tier stream at send time anyway.
  return streamModel?.selectionAvailability?.lockReason ?? null;
}

export function getTierIdForMetaModelId(modelId: string): ModelTierId | null {
  return isModelStreamId(modelId) ? TIER_BY_META_MODEL_ID[modelId] : null;
}

export function getDefaultTierId(
  streamModels: EnabledModelConfigurationType[]
): ModelTierId {
  const standard = streamModels.find(
    (model) => model.modelId === AUTO_MODEL_ID
  );

  return standard && !standard.isSelectable ? "fast" : "standard";
}

export function getReasoningEffortLabel(
  effort: ReasoningEffort
): string | null {
  return effort === "none" ? null : capitalize(effort);
}

export function formatModelEffortLabel(
  displayName: string,
  effort: ReasoningEffort
): string {
  const effortLabel = getReasoningEffortLabel(effort);

  return effortLabel ? `${displayName} ${effortLabel}` : displayName;
}

export function getTierResolvedModelLabel(
  tierId: ModelTierId,
  streams: ModelStreamResolutionsType | null
): string | undefined {
  const resolution = streams?.[getModelTier(tierId).metaModelId];
  if (!resolution) {
    return undefined;
  }
  return formatModelEffortLabel(
    resolution.displayName,
    resolution.reasoningEffort
  );
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

// A `SelectionDisplay` whose effort may be absent: the manage-agents filter
// names a model without picking an effort for it.
export type SelectedEntry =
  | { kind: "tier"; tierId: ModelTierId }
  | {
      kind: "model";
      model: ModelConfigurationType;
      effort: ReasoningEffort | null;
    };

export type SelectedModelEntry = Extract<SelectedEntry, { kind: "model" }>;

// What the menu highlights. The conversation picker passes a single display
// plus the agent default; the manage-agents filter passes one per active
// filter and no default.
export interface ModelPickerSelectionModel {
  selected: SelectedEntry[];
  agentDefault: SelectionDisplay | null;
  // Present only when the active selection can be reverted to the default.
  onRevert?: () => void;
}

export type ModelLockReason = ModelSelectionLockReason;

// One stop of the reasoning-effort slider. A null reason means it is available.
// Unsupported efforts are unavailable; workspace-plan and model-access
// restrictions are locks.
export type EffortStop = ReasoningEffortSelectionAvailabilityType;

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
  display: SelectedEntry
): boolean {
  return (
    display.kind === "model" &&
    display.model.providerId === model.providerId &&
    display.model.modelId === model.modelId
  );
}

export function isTierDisplayed(
  tierId: ModelTierId,
  display: SelectedEntry
): boolean {
  return display.kind === "tier" && display.tierId === tierId;
}

export function isTierSelected(
  tierId: ModelTierId,
  selection: ModelPickerSelectionModel
): boolean {
  return selection.selected.some((display) => isTierDisplayed(tierId, display));
}

export function findSelectedModelEntry(
  model: ModelConfigurationType,
  selection: ModelPickerSelectionModel
): SelectedModelEntry | undefined {
  return selection.selected.find(
    (entry): entry is SelectedModelEntry =>
      entry.kind === "model" && isModelSelection(model, entry)
  );
}

export function getSelectedModelEntries(
  selection: ModelPickerSelectionModel
): SelectedModelEntry[] {
  return selection.selected.filter(
    (entry): entry is SelectedModelEntry => entry.kind === "model"
  );
}

// Display equality ignoring reasoning effort: two model displays for the same
// model are "the same" regardless of effort. Used to highlight the selected row
// and to mark the default, where effort is surfaced by the slider instead.
function isSameDisplay(a: SelectionDisplay, b: SelectionDisplay): boolean {
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

function hasSelectionAvailability(
  model: ModelConfigurationType
): model is ModelConfigurationType & {
  selectionAvailability: ModelSelectionAvailabilityType;
} {
  return "selectionAvailability" in model;
}

export function getSelectionAvailability(
  model: ModelConfigurationType
): ModelSelectionAvailabilityType | null {
  return hasSelectionAvailability(model) ? model.selectionAvailability : null;
}

export function getEffortStops(model: ModelConfigurationType): EffortStop[] {
  return getSelectionAvailability(model)?.reasoningEfforts ?? [];
}

export function getInitialEffort(
  model: ModelConfigurationType
): ReasoningEffort {
  return (
    getSelectionAvailability(model)?.defaultReasoningEffort ??
    model.defaultReasoningEffort
  );
}

export function getModelLockReason(
  model: ModelConfigurationType
): ModelLockReason | null {
  return getSelectionAvailability(model)?.lockReason ?? null;
}

export function getModelLockTooltip(reason: ModelLockReason): string {
  switch (reason) {
    case "workspace_plan":
      return WORKSPACE_PLAN_LOCKED_TOOLTIP;
    case "model_access":
      return MODEL_ACCESS_LOCKED_TOOLTIP;
    default:
      assertNeverAndIgnore(reason);
      return "";
  }
}

export function getEffortStopTooltip(stop: EffortStop): string | null {
  switch (stop.unavailabilityReason) {
    case "workspace_plan":
      return WORKSPACE_PLAN_LOCKED_TOOLTIP;
    case "model_access":
      return MODEL_ACCESS_LOCKED_TOOLTIP;
    case "unsupported":
      return `This model doesn't support ${capitalize(stop.effort)} reasoning.`;
    case null:
      return null;
    default:
      assertNeverAndIgnore(stop.unavailabilityReason);
      return null;
  }
}

export function getModelWithReasoningEffortLabel(
  display: SelectionDisplay
): string {
  switch (display.kind) {
    case "tier":
      return getModelTier(display.tierId).name;
    case "model": {
      const { model, effort } = display;
      return formatModelEffortLabel(model.displayName, effort);
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

function resolveRequestedSelection(
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

function resolveAgentDefault({
  agentModel,
  models,
}: {
  agentModel: AgentModelConfigurationType | null;
  models: EnabledModelConfigurationType[];
}): Selection {
  const tierDefault: Selection = {
    display: { kind: "tier", tierId: getDefaultTierId(models) },
    toSend: undefined,
  };
  if (!agentModel) {
    return tierDefault;
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
    return tierDefault;
  }

  // Keep `toSend` undefined so the agent runs its own configured model/effort
  // server-side; the slider surfaces the agent's configured effort as-is.
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
  models: EnabledModelConfigurationType[];
}): { shown: Selection; agentDefault: Selection } {
  const agentDefault = resolveAgentDefault({ agentModel, models });
  const shown =
    resolveRequestedSelection(models, lastRequestedModel) ??
    resolveRequestedSelection(models, sessionSticky) ??
    agentDefault;
  return { shown, agentDefault };
}
