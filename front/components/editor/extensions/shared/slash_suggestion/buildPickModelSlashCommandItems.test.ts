import { buildPickModelSlashCommandItems } from "@app/components/editor/extensions/shared/slash_suggestion/buildPickModelSlashCommandItems";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import { CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { GPT_4_1_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { describe, expect, it } from "vitest";

const Icon = () => null;

function asSelectable(
  model: ModelConfigurationType
): EnabledModelConfigurationType {
  return { ...model, isSelectable: true };
}

describe("buildPickModelSlashCommandItems", () => {
  it("lists tiers first, then one row per slider effort", () => {
    const items = buildPickModelSlashCommandItems({
      getModelIcon: () => Icon,
      lockPremiumEfforts: false,
      models: [asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG)],
      query: "",
    });

    expect(items.map((item) => item.label)).toEqual([
      "Fast",
      "Standard",
      "Complex",
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} Light`,
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} Medium`,
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} High`,
    ]);
    expect(
      items
        .filter((item) => item.data.selection.display.kind === "model")
        .map((item) => item.data.selection.toSend?.reasoningEffort)
    ).toEqual(["light", "medium", "high"]);
  });

  it("uses a single row for non-reasoning models", () => {
    const items = buildPickModelSlashCommandItems({
      getModelIcon: () => Icon,
      lockPremiumEfforts: false,
      models: [asSelectable(GPT_4_1_MODEL_CONFIG)],
      query: "",
    });

    expect(
      items
        .filter((item) => item.data.selection.display.kind === "model")
        .map((item) => item.label)
    ).toEqual([GPT_4_1_MODEL_CONFIG.displayName]);
    expect(
      items.find((item) => item.data.selection.display.kind === "model")?.data
        .selection.toSend?.reasoningEffort
    ).toBe("none");
  });

  it("filters by query", () => {
    expect(
      buildPickModelSlashCommandItems({
        getModelIcon: () => Icon,
        lockPremiumEfforts: false,
        models: [
          asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG),
          asSelectable(GPT_4_1_MODEL_CONFIG),
        ],
        query: "claude",
      }).map((item) => item.data.selection.toSend?.modelId)
    ).toEqual([
      CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.modelId,
      CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.modelId,
      CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.modelId,
    ]);
  });

  it("omits premium efforts and the Complex tier when gated", () => {
    const items = buildPickModelSlashCommandItems({
      getModelIcon: () => Icon,
      lockPremiumEfforts: true,
      models: [asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG)],
      query: "",
    });

    expect(items.map((item) => item.label)).toEqual([
      "Fast",
      "Standard",
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} Light`,
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} Medium`,
    ]);
  });
});
