import { resolveDefaultSelection } from "@app/components/assistant/conversation/input_bar/modelPickerUtils";
import { USED_MODEL_CONFIGS } from "@app/components/providers/model_configs";
import type { AgentModelConfigurationType } from "@app/types/assistant/agent";
import {
  GPT_5_5_MODEL_ID,
  GPT_5_6_SOL_MODEL_ID,
} from "@app/types/assistant/models/openai";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { describe, expect, it } from "vitest";

// The workspace picker shortlist. GPT-5.5 is intentionally NOT part of it (it is
// still a supported model, just no longer surfaced in the picker), whereas
// GPT-5.6 Sol is.
const shortlist = USED_MODEL_CONFIGS as ModelConfigurationType[];

describe("resolveDefaultSelection", () => {
  it("shows an agent's default model that IS in the shortlist as the default", () => {
    const agentModel: AgentModelConfigurationType = {
      providerId: "openai",
      modelId: GPT_5_6_SOL_MODEL_ID,
      temperature: 0.7,
      reasoningEffort: "medium",
    };

    const selection = resolveDefaultSelection({
      agentModel,
      lastRequestedModel: null,
      models: shortlist,
    });

    expect(selection.kind).toBe("agent");
    if (selection.kind === "agent") {
      expect(selection.model.modelId).toBe(GPT_5_6_SOL_MODEL_ID);
    }
  });

  it("falls back to the full catalog for a model not in the shortlist so it shows as default (not auto)", () => {
    // Sanity check: the model genuinely is absent from the shortlist.
    expect(shortlist.some((m) => m.modelId === GPT_5_5_MODEL_ID)).toBe(false);

    const agentModel: AgentModelConfigurationType = {
      providerId: "openai",
      modelId: GPT_5_5_MODEL_ID,
      temperature: 0.7,
      reasoningEffort: "high",
    };

    const selection = resolveDefaultSelection({
      agentModel,
      lastRequestedModel: null,
      models: shortlist,
    });

    // Before the fix this collapsed to { kind: "auto" }.
    expect(selection.kind).toBe("agent");
    if (selection.kind === "agent") {
      expect(selection.model.modelId).toBe(GPT_5_5_MODEL_ID);
      expect(selection.effort).toBe("high");
    }
  });

  it("falls back to auto when the agent has no model", () => {
    const selection = resolveDefaultSelection({
      agentModel: null,
      lastRequestedModel: null,
      models: shortlist,
    });

    expect(selection.kind).toBe("auto");
  });
});
