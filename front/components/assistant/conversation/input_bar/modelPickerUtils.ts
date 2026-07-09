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

// A selection the user can actively make in the picker: either "Auto" or a
// concrete model + effort.
export type UserModelSelection =
  | { kind: "auto" }
  | { kind: "model"; model: ModelConfigurationType; effort: ReasoningEffort };

// What the picker shows. On top of the user-pickable options, the derived
// default can be the addressed agent's own configured model ("agent"): it
// renders like a concrete model but is sent as *no* override, so the agent runs
// its configured model and the resolution stays attributed to the agent.
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
  if (selection.kind === "auto") {
    return "Auto";
  }
  const { model, effort } = selection;

  if (effort === "none") {
    return model.displayName;
  }

  return `${model.displayName} ${capitalize(effort)}`;
}

// Converts the picker's shown selection into the API model selection sent with
// the message. See `Selection` above for why each kind maps the way it does.
export function toModelSelection(
  selection: Selection
): ModelSelectionType | undefined {
  switch (selection.kind) {
    case "auto":
      // Explicit auto override, so the backend routes through the auto model
      // even when the addressed agent's own configured model is not auto.
      // "none" is the auto model's only supported effort and keeps the value
      // round-trippable (so a reload re-derives "Auto" from the stored request).
      return {
        providerId: AUTO_MODEL_ID,
        modelId: AUTO_MODEL_ID,
        reasoningEffort: "none",
      };
    case "agent":
      // The picker shows the agent's own configured model as its default: send
      // no override so the agent runs its configured model.
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

// Reasoning effort for a resolved model: honor the requested effort when the
// model supports it, otherwise the model's default (or its first selectable
// effort). Effort is never defaulted independently of the model.
function resolveEffort(
  model: ModelConfigurationType,
  requested: ReasoningEffort | undefined
): ReasoningEffort {
  const selectable = getSelectableReasoningEfforts(model);
  if (requested && selectable.includes(requested)) {
    return requested;
  }
  if (selectable.includes(model.defaultReasoningEffort)) {
    return model.defaultReasoningEffort;
  }
  return selectable[0] ?? model.defaultReasoningEffort;
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

// The picker's default selection when the user hasn't picked anything: the
// model the current user's previous message ran on, falling back to the
// addressed agent's configured model, falling back to "Auto". Purely derived
// from its inputs — it recomputes as the agent, the last message, and the model
// list load in, with no ordering dependency or seeding step.
export function resolveDefaultSelection({
  agentModel,
  lastRequestedModel,
  models,
}: {
  agentModel: AgentModelConfigurationType | null;
  lastRequestedModel: ModelSelectionType | null;
  models: ModelConfigurationType[];
}): Selection {
  // 1. Keep the model the current user's previous message ran on, if any.
  if (lastRequestedModel) {
    if (lastRequestedModel.modelId === AUTO_MODEL_ID) {
      return { kind: "auto" };
    }
    const model = findAvailableModel(models, lastRequestedModel);
    if (model) {
      return {
        kind: "model",
        model,
        effort: resolveEffort(model, lastRequestedModel.reasoningEffort),
      };
    }
    // Last model no longer available (removed / BYOK revoked / still loading):
    // fall back to the agent's default below.
  }

  // 2. No usable previous model: use the addressed agent's configured model.
  //    An auto (or not-yet-resolved) agent shows "Auto".
  if (!agentModel || agentModel.modelId === AUTO_MODEL_ID) {
    return { kind: "auto" };
  }
  const model = findAvailableModel(models, agentModel);
  if (!model) {
    // Agent's model not (yet) available (e.g. models still loading): show Auto
    // until it resolves.
    return { kind: "auto" };
  }
  return {
    kind: "agent",
    model,
    effort: resolveEffort(model, agentModel.reasoningEffort),
  };
}

export function resolveAgentDefaultModel({
  agentModel,
  models,
}: {
  agentModel: AgentModelConfigurationType | null;
  models: ModelConfigurationType[];
}): ModelWithReasoningEffort | null {
  if (!agentModel || agentModel.modelId === AUTO_MODEL_ID) {
    return null;
  }
  const model = findAvailableModel(models, agentModel);
  if (!model) {
    return null;
  }
  return { model, effort: resolveEffort(model, agentModel.reasoningEffort) };
}
