import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import {
  AUTO_MODEL_ID,
  isModelStreamId,
  MODEL_STREAMS,
} from "@app/types/assistant/models/auto";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
  ModelProviderIdType,
  ModelSelectionType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { Star01, Star03, Star04 } from "@dust-tt/sparkle";
import capitalize from "lodash/capitalize";
import type { ComponentType } from "react";

export type ModelTierId = "quick" | "standard" | "deep";

export const AUTO_TOOLTIP =
  "Dust selects and switches model for cost efficient performance and reliability.";

const QUICK_TOOLTIP =
  "Fast, lightweight models for simple tasks. Dust routes among them automatically.";
const DEEP_TOOLTIP =
  "Powerful models for complex tasks. Dust routes among them automatically.";

// What a tier sends: "Auto" (Dust selects any model — the Standard tier), a
// "stream" (Dust routes among a curated pool — the Quick/Deep tiers), or a
// hardcoded model + reasoning-effort combo.
type TierSelection =
  | { kind: "auto" }
  | { kind: "stream"; streamId: ModelStreamIdType }
  | {
      kind: "model";
      providerId: ModelProviderIdType;
      modelId: string;
      effort: ReasoningEffort;
    };

export interface ModelTier {
  id: ModelTierId;
  name: string;
  subtitle: string;
  // Blurb shown in the tier's hover tooltip (for auto/stream tiers, which have
  // no single concrete model to describe).
  tooltip: string;
  icon: ComponentType;
  selection: TierSelection;
}

// The tiers are the primary picks. Order matters: it is the order shown in the
// picker. "Standard" behaves like the "Auto" option (Dust selects any model) and
// is the fallback when nothing else is resolved; "Fast" and "Complex" route among
// their own curated streams.
export const MODEL_TIERS: ModelTier[] = [
  {
    id: "quick",
    name: "Fast",
    subtitle: "Simple tasks",
    tooltip: QUICK_TOOLTIP,
    icon: Star04,
    selection: { kind: "stream", streamId: "auto_fast" },
  },
  {
    id: "standard",
    name: "Standard",
    subtitle: "Everyday tasks",
    tooltip: AUTO_TOOLTIP,
    icon: Star01,
    selection: { kind: "auto" },
  },
  {
    id: "deep",
    name: "Complex",
    subtitle: "Heavy tasks",
    tooltip: DEEP_TOOLTIP,
    icon: Star03,
    selection: { kind: "stream", streamId: "auto_complex" },
  },
];

// Per reasoning-effort blurbs shown in each model's hover tooltip: what the
// effort does, and what it is recommended for.
export const REASONING_EFFORT_INFO: Record<
  ReasoningEffort,
  { reasoning: string }
> = {
  none: {
    reasoning: "No additional reasoning, for the fastest responses",
  },
  light: {
    reasoning: "Light reasoning effort, faster responses.",
  },
  medium: {
    reasoning: "Medium reasoning effort, balancing speed and quality.",
  },
  high: {
    reasoning: "High reasoning effort, longer wait times but higher quality.",
  },
};

export interface ModelWithReasoningEffort {
  model: ModelConfigurationType;
  effort: ReasoningEffort;
}

// A tier resolved against the workspace's actually-available models.
export interface ResolvedTier {
  tier: ModelTier;
  toSend: ModelSelectionType;
  // The resolved model + effort for a concrete tier (used for its tooltip);
  // null for the auto (Standard) and stream (Quick/Deep) tiers, which route
  // dynamically and have no single model to show.
  modelWithEffort: ModelWithReasoningEffort | null;
}

// A model with the reasoning efforts it supports, low to high. Backs both the
// per-maker rows and the flat search results.
export interface ModelEntry {
  model: ModelConfigurationType;
  efforts: ReasoningEffort[];
}

export interface MakerGroup {
  makerId: ModelMakerIdType;
  models: ModelEntry[];
}

// A model identity, used to mark which row in "More models" is the default.
export interface ModelRef {
  providerId: string;
  modelId: string;
}

// A model identity plus the selected reasoning effort, used to mark the current
// selection and drive its effort slider.
export interface SelectedModelRef extends ModelRef {
  effort: ReasoningEffort;
}

export function modelRefMatches(
  ref: ModelRef | null,
  model: ModelConfigurationType
): boolean {
  return (
    ref !== null &&
    ref.providerId === model.providerId &&
    ref.modelId === model.modelId
  );
}

export type UserModelSelection =
  | { kind: "auto"; toSend: ModelSelectionType }
  | { kind: "stream"; streamId: ModelStreamIdType; toSend: ModelSelectionType }
  | ({ kind: "model"; toSend: ModelSelectionType } & ModelWithReasoningEffort);

export type Selection =
  | UserModelSelection
  | ({ kind: "agent"; toSend: undefined } & ModelWithReasoningEffort);

export const AUTO_MODEL_SELECTION: ModelSelectionType = {
  providerId: AUTO_MODEL_ID,
  modelId: AUTO_MODEL_ID,
  reasoningEffort: "none",
};

// A stream tier sends its sentinel model (providerId and modelId both equal the
// stream id); the backend routes it to a concrete model at send-time.
export function buildStreamSelection(
  streamId: ModelStreamIdType
): ModelSelectionType {
  return {
    providerId: streamId,
    modelId: streamId,
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

// The list body is a small state machine: a loading / empty / ready view
// depending on the models query. Modeling it as a single discriminated union
// keeps the picker's props flat instead of a fistful of correlated booleans.
// Search over every model happens inside the "More models" panel, so it is not
// part of this top-level state.
export type ModelPickerListState =
  | { kind: "loading" }
  | { kind: "empty" }
  | {
      kind: "ready";
      tiers: ResolvedTier[];
      moreByMaker: MakerGroup[];
    };

export function getSelectableReasoningEfforts(
  model: ModelConfigurationType
): ReasoningEffort[] {
  const efforts = getAvailableReasoningEfforts(model.supportedReasoningEfforts);
  const withReasoning = efforts.filter((effort) => effort !== "none");
  return withReasoning.length > 0 ? withReasoning : efforts;
}

export function getModelWithReasoningEffortKey(
  providerId: string,
  modelId: string,
  effort: ReasoningEffort
): string {
  return `${providerId}/${modelId}/${effort}`;
}

// Narrower than `Selection`: label rendering only needs the kind/model/effort,
// not the API payload, so callers without a `toSend` handy (e.g. a per-message
// model resolved after the fact) can pass a plain literal.
export type LabelSelection =
  | { kind: "auto" }
  | { kind: "stream"; streamId: ModelStreamIdType }
  | ({ kind: "agent" | "model" } & ModelWithReasoningEffort);

export function getModelWithReasoningEffortLabel(
  selection: LabelSelection
): string {
  switch (selection.kind) {
    case "auto":
      return "Auto";
    case "stream":
      return capitalize(selection.streamId);
    case "agent":
      return "Default";
    case "model": {
      const { model, effort } = selection;
      return effort === "none"
        ? model.displayName
        : `${model.displayName} ${capitalize(effort)}`;
    }
    default:
      assertNeverAndIgnore(selection);
      return "";
  }
}

// A stable identity for a selection, used to compare the shown selection against
// the default (to know whether there is anything to revert) and to mark the
// default row. "auto" and each stream collapse to a single sentinel; models/agent
// defaults use their model + effort key.
export function getSelectionIdentityKey(selection: LabelSelection): string {
  switch (selection.kind) {
    case "auto":
      return "auto";
    case "stream":
      return `stream:${selection.streamId}`;
    case "agent":
    case "model":
      return getModelWithReasoningEffortKey(
        selection.model.providerId,
        selection.model.modelId,
        selection.effort
      );
    default:
      assertNeverAndIgnore(selection);
      return "";
  }
}

// Returns the tier a selection corresponds to, or null when it is not one of
// the tiers. An "auto" selection maps to the Standard tier; a "stream" selection
// maps to the Quick/Deep tier of the same stream. A concrete "model" selection
// maps to a tier only when it matches a "model" tier's pin. An "agent" default
// never maps to a tier — it is surfaced through the "More models" path instead.
export function getMatchingTier(selection: LabelSelection): ModelTier | null {
  switch (selection.kind) {
    case "auto":
      return MODEL_TIERS.find((tier) => tier.selection.kind === "auto") ?? null;
    case "stream":
      return (
        MODEL_TIERS.find(
          (tier) =>
            tier.selection.kind === "stream" &&
            tier.selection.streamId === selection.streamId
        ) ?? null
      );
    case "model": {
      const { model, effort } = selection;
      return (
        MODEL_TIERS.find(
          (tier) =>
            tier.selection.kind === "model" &&
            tier.selection.providerId === model.providerId &&
            tier.selection.modelId === model.modelId &&
            tier.selection.effort === effort
        ) ?? null
      );
    }
    case "agent":
      return null;
    default:
      assertNeverAndIgnore(selection);
      return null;
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

// Resolve the tiers against the workspace's actual models. The Auto (Standard)
// tier is always available; a stream tier is available when at least one of its
// candidate models is; a concrete "model" tier is dropped when its model is
// unavailable or does not support the tier effort.
export function resolveTiers(models: ModelConfigurationType[]): ResolvedTier[] {
  return MODEL_TIERS.flatMap((tier): ResolvedTier[] => {
    if (tier.selection.kind === "auto") {
      return [{ tier, toSend: AUTO_MODEL_SELECTION, modelWithEffort: null }];
    }
    if (tier.selection.kind === "stream") {
      const { streamId } = tier.selection;
      const hasAvailableCandidate = MODEL_STREAMS[streamId].some(
        (candidate) => {
          const model = findAvailableModel(models, candidate);
          return (
            model &&
            getAvailableReasoningEfforts(
              model.supportedReasoningEfforts
            ).includes(candidate.reasoningEffort)
          );
        }
      );
      if (!hasAvailableCandidate) {
        return [];
      }
      return [
        {
          tier,
          toSend: buildStreamSelection(streamId),
          modelWithEffort: null,
        },
      ];
    }
    const { providerId, modelId, effort } = tier.selection;
    const model = findAvailableModel(models, { providerId, modelId });
    if (
      !model ||
      !getAvailableReasoningEfforts(model.supportedReasoningEfforts).includes(
        effort
      )
    ) {
      return [];
    }
    return [
      {
        tier,
        toSend: buildModelSelection(model, effort),
        modelWithEffort: { model, effort },
      },
    ];
  });
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
  const requestedModel = selection
    ? findAvailableModel(models, selection)
    : undefined;
  if (!requestedModel) {
    return null;
  }
  if (requestedModel.modelId === AUTO_MODEL_ID) {
    return { kind: "auto", toSend: AUTO_MODEL_SELECTION };
  }
  if (isModelStreamId(requestedModel.modelId)) {
    const streamId = requestedModel.modelId;
    return {
      kind: "stream",
      streamId,
      toSend: buildStreamSelection(streamId),
    };
  }
  const effort =
    selection?.reasoningEffort ?? requestedModel.defaultReasoningEffort;
  return {
    kind: "model",
    model: requestedModel,
    effort,
    toSend: buildModelSelection(requestedModel, effort),
  };
}

export function resolveDefaultSelection({
  agentModel,
  lastRequestedModel,
  sessionSticky,
  models,
}: {
  agentModel: AgentModelConfigurationType | null;
  lastRequestedModel: ModelSelectionType | null;
  sessionSticky?: ModelSelectionType | null;
  models: ModelConfigurationType[];
}): Selection {
  const fromLastRequested = resolveRequestedSelection(
    models,
    lastRequestedModel
  );
  if (fromLastRequested) {
    return fromLastRequested;
  }

  const fromSticky = resolveRequestedSelection(models, sessionSticky);
  if (fromSticky) {
    return fromSticky;
  }

  const agentDefaultModel = agentModel
    ? findAgentModel(models, agentModel)
    : undefined;
  if (agentDefaultModel && agentDefaultModel.modelId !== AUTO_MODEL_ID) {
    return {
      kind: "agent",
      model: agentDefaultModel,
      effort:
        agentModel?.reasoningEffort ?? agentDefaultModel.defaultReasoningEffort,
      toSend: undefined,
    };
  }

  // No agent default (or the agent default is "Auto"): fall back to the
  // Standard tier, which sends "Auto".
  return { kind: "auto", toSend: AUTO_MODEL_SELECTION };
}
