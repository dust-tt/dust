import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/types/assistant/models/anthropic";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { GPT_5_5_MODEL_ID } from "@app/types/assistant/models/openai";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
  ModelSelectionType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import capitalize from "lodash/capitalize";

export const SUGGESTED_PINS: {
  providerId: ModelProviderIdType;
  modelId: string;
  effort: ReasoningEffort;
  recommendation: string;
}[] = [
  {
    providerId: "anthropic",
    modelId: CLAUDE_SONNET_4_6_MODEL_ID,
    effort: "light",
    recommendation:
      "Quick answers. Recommended for easy retrieval, light analysis or general questions.",
  },
  {
    providerId: "anthropic",
    modelId: CLAUDE_SONNET_4_6_MODEL_ID,
    effort: "medium",
    recommendation:
      "Everyday tasks. Recommended for multi-step tasks, Frames, analysis.",
  },
  {
    providerId: "openai",
    modelId: GPT_5_5_MODEL_ID,
    effort: "high",
    recommendation:
      "Hard problems. Recommended for high quality retrieval, complex analysis and Frames",
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

export interface SuggestedModelWithReasoningEffort
  extends ModelWithReasoningEffort {
  recommendation: string;
}

export interface ProviderGroup {
  providerId: ModelProviderIdType;
  models: { model: ModelConfigurationType; efforts: ReasoningEffort[] }[];
}

export type UserModelSelection =
  | { kind: "auto" }
  | { kind: "model"; model: ModelConfigurationType; effort: ReasoningEffort };

export type Selection =
  | UserModelSelection
  | { kind: "agent"; model: ModelConfigurationType; effort: ReasoningEffort };

// The list body is a small state machine: hidden while Auto is on, then a
// loading / empty / search-results / browse view depending on the models
// query and the search input. Modeling it as a single discriminated union
// keeps the picker's props flat instead of a fistful of correlated booleans.
export type ModelPickerListState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "search"; models: ModelWithReasoningEffort[] }
  | {
      kind: "browse";
      agentDefault: ModelWithReasoningEffort | null;
      suggested: SuggestedModelWithReasoningEffort[];
      moreByProvider: ProviderGroup[];
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

export function getModelWithReasoningEffortLabel(selection: Selection): string {
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

export function toModelSelection(
  selection: Selection
): ModelSelectionType | undefined {
  switch (selection.kind) {
    case "auto":
      return {
        providerId: AUTO_MODEL_ID,
        modelId: AUTO_MODEL_ID,
        reasoningEffort: "none",
      };
    case "agent":
      // No override, use the agent model.
      return undefined;
    case "model":
      return {
        providerId: selection.model.providerId,
        modelId: selection.model.modelId,
        reasoningEffort: selection.effort,
      };
    default:
      assertNeverAndIgnore(selection);
      return undefined;
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

export function resolveDefaultSelection({
  agentModel,
  lastRequestedModel,
  models,
}: {
  agentModel: AgentModelConfigurationType | null;
  lastRequestedModel: ModelSelectionType | null;
  models: ModelConfigurationType[];
}): Selection {
  if (lastRequestedModel) {
    if (lastRequestedModel.modelId === AUTO_MODEL_ID) {
      return { kind: "auto" };
    }
    const model = findAvailableModel(models, lastRequestedModel);
    if (model) {
      return {
        kind: "model",
        model,
        effort:
          lastRequestedModel.reasoningEffort ?? model.defaultReasoningEffort,
      };
    }
  }

  if (!agentModel || agentModel.modelId === AUTO_MODEL_ID) {
    return { kind: "auto" };
  }
  const model = findAvailableModel(models, agentModel);
  if (!model) {
    return { kind: "auto" };
  }
  return {
    kind: "agent",
    model,
    effort: agentModel.reasoningEffort ?? model.defaultReasoningEffort,
  };
}
