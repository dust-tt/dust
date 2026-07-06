import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/types/assistant/models/anthropic";
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
  "Dust selects and switches model for cost efficient performance and reliability. When an agent is created using a specific model, we use this model.";

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

export interface ModelLine {
  model: ModelConfigurationType;
  effort: ReasoningEffort;
}

export interface SuggestedLine extends ModelLine {
  recommendation: string;
}

export interface ProviderGroup {
  providerId: ModelProviderIdType;
  models: { model: ModelConfigurationType; efforts: ReasoningEffort[] }[];
}

export type Selection =
  | { kind: "auto" }
  | { kind: "model"; model: ModelConfigurationType; effort: ReasoningEffort };

export function getSelectableReasoningEfforts(
  model: ModelConfigurationType
): ReasoningEffort[] {
  const efforts = getAvailableReasoningEfforts(model.supportedReasoningEfforts);
  const withReasoning = efforts.filter((effort) => effort !== "none");
  return withReasoning.length > 0 ? withReasoning : efforts;
}

export function getLineKey(
  providerId: string,
  modelId: string,
  effort: ReasoningEffort
): string {
  return `${providerId}/${modelId}/${effort}`;
}

export function getLineLabel(selection: Selection): string {
  if (selection.kind === "auto") {
    return "Auto";
  }
  const { model, effort } = selection;

  if (effort === "none") {
    return model.displayName;
  }

  return `${model.displayName} ${capitalize(effort)}`;
}

// Converts the picker's local selection into the API model selection
export function toModelSelection(
  selection: Selection
): ModelSelectionType | undefined {
  switch (selection.kind) {
    case "auto":
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
