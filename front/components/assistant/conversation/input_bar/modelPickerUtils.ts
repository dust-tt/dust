import { getSupportedModelConfig } from "@app/lib/llms/model_configurations";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/types/assistant/models/anthropic";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { GPT_5_6_TERRA_MODEL_ID } from "@app/types/assistant/models/openai";
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

// What a tier sends: either "Auto" (Dust selects the model — the Standard tier)
// or a hardcoded model + reasoning-effort combo.
type TierSelection =
  | { kind: "auto" }
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
  icon: ComponentType;
  selection: TierSelection;
}

// The tiers are the primary picks. Order matters: it is the order shown in the
// picker. "Standard" behaves like the old "Auto" option (Dust selects the
// model) and is the fallback when nothing else is resolved.
export const MODEL_TIERS: ModelTier[] = [
  {
    id: "quick",
    name: "Quick",
    subtitle: "Simple tasks",
    icon: Star04,
    selection: {
      kind: "model",
      providerId: "anthropic",
      modelId: CLAUDE_SONNET_4_6_MODEL_ID,
      effort: "light",
    },
  },
  {
    id: "standard",
    name: "Standard",
    subtitle: "Everyday tasks",
    icon: Star01,
    selection: { kind: "auto" },
  },
  {
    id: "deep",
    name: "Deep",
    subtitle: "Heavy tasks",
    icon: Star03,
    selection: {
      kind: "model",
      providerId: "openai",
      modelId: GPT_5_6_TERRA_MODEL_ID,
      effort: "high",
    },
  },
];

export const AUTO_TOOLTIP =
  "Dust selects and switches model for cost efficient performance and reliability.";

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
  // null for the "Auto" (Standard) tier.
  modelWithEffort: ModelWithReasoningEffort | null;
}

export interface MakerGroup {
  makerId: ModelMakerIdType;
  models: { model: ModelConfigurationType; efforts: ReasoningEffort[] }[];
}

export type UserModelSelection =
  | { kind: "auto"; toSend: ModelSelectionType }
  | ({ kind: "model"; toSend: ModelSelectionType } & ModelWithReasoningEffort);

export type Selection =
  | UserModelSelection
  | ({ kind: "agent"; toSend: undefined } & ModelWithReasoningEffort);

export const AUTO_MODEL_SELECTION: ModelSelectionType = {
  providerId: AUTO_MODEL_ID,
  modelId: AUTO_MODEL_ID,
  reasoningEffort: "none",
};

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
  | ({ kind: "agent" | "model" } & ModelWithReasoningEffort);

export function getModelWithReasoningEffortLabel(
  selection: LabelSelection
): string {
  switch (selection.kind) {
    case "auto":
      return "Auto";
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
// default row. "auto" collapses to a single sentinel; models/agent defaults use
// their model + effort key.
export function getSelectionIdentityKey(selection: LabelSelection): string {
  switch (selection.kind) {
    case "auto":
      return "auto";
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
// the tiers. An "auto" selection maps to the Standard tier; a concrete "model"
// selection maps to Quick/Deep when it matches their pins. An "agent" default
// never maps to a tier — it is surfaced through the "More models" path instead.
export function getMatchingTier(selection: LabelSelection): ModelTier | null {
  switch (selection.kind) {
    case "auto":
      return MODEL_TIERS.find((tier) => tier.selection.kind === "auto") ?? null;
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
// tier is always available; a concrete tier is dropped when its model is
// unavailable or does not support the tier effort.
export function resolveTiers(models: ModelConfigurationType[]): ResolvedTier[] {
  return MODEL_TIERS.flatMap((tier): ResolvedTier[] => {
    if (tier.selection.kind === "auto") {
      return [{ tier, toSend: AUTO_MODEL_SELECTION, modelWithEffort: null }];
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
