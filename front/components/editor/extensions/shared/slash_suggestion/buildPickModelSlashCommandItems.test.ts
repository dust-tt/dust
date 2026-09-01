import { buildPickModelSlashCommandItems } from "@app/components/editor/extensions/shared/slash_suggestion/buildPickModelSlashCommandItems";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import { CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { AUTO_COMPLEX_MODEL_CONFIG } from "@app/types/assistant/models/auto";
import { GEMINI_3_1_FLASH_LITE_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";
import { GPT_4_1_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { describe, expect, it } from "vitest";

const Icon = () => null;

function asSelectable(
  model: ModelConfigurationType,
  unavailabilityReason: "premium" | "model_tier" | null = null,
  effortReasons: Partial<
    Record<ReasoningEffort, "premium" | "model_tier" | "unsupported">
  > = {}
): EnabledModelConfigurationType {
  const reasoningEfforts = (["light", "medium", "high"] as const)
    .filter((effort) => model.supportedReasoningEfforts[effort])
    .map((effort) => ({
      effort,
      unavailabilityReason: effortReasons[effort] ?? null,
    }));

  return {
    ...model,
    isSelectable: unavailabilityReason !== "model_tier",
    selectionAvailability: {
      defaultReasoningEffort: model.defaultReasoningEffort,
      reasoningEfforts,
      unavailabilityReason,
    },
  };
}

describe("buildPickModelSlashCommandItems", () => {
  it("lists tiers first, then one row per slider effort", () => {
    const items = buildPickModelSlashCommandItems({
      getModelIcon: () => Icon,
      models: [asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG)],
      query: "",
      streams: null,
    });

    expect(items.map((item) => item.label)).toEqual([
      "Basic",
      "Standard",
      "Premium",
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
      models: [asSelectable(GPT_4_1_MODEL_CONFIG)],
      query: "",
      streams: null,
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

  it("uses display names for model makers", () => {
    const items = buildPickModelSlashCommandItems({
      getModelIcon: () => Icon,
      models: [asSelectable(GEMINI_3_1_FLASH_LITE_MODEL_CONFIG)],
      query: "",
      streams: null,
    });

    const descriptions = items
      .filter((item) => item.data.selection.display.kind === "model")
      .map((item) => item.description);
    expect(descriptions.length).toBeGreaterThan(0);
    expect(descriptions.every((description) => description === "Google")).toBe(
      true
    );
  });

  it("filters by query", () => {
    expect(
      buildPickModelSlashCommandItems({
        getModelIcon: () => Icon,
        models: [
          asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG),
          asSelectable(GPT_4_1_MODEL_CONFIG),
        ],
        query: "claude",
        streams: null,
      }).map((item) => item.data.selection.toSend?.modelId)
    ).toEqual([
      CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.modelId,
      CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.modelId,
      CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.modelId,
    ]);
  });

  it("omits a tier whose stream is above the member's model-tier cap", () => {
    const items = buildPickModelSlashCommandItems({
      getModelIcon: () => Icon,
      models: [
        asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG),
        asSelectable(AUTO_COMPLEX_MODEL_CONFIG, "model_tier"),
      ],
      query: "",
      streams: null,
    });

    expect(
      items
        .filter((item) => item.data.selection.display.kind === "tier")
        .map((item) => item.label)
    ).toEqual(["Basic", "Standard"]);
  });

  it("omits efforts and tiers the backend marks as premium", () => {
    const items = buildPickModelSlashCommandItems({
      getModelIcon: () => Icon,
      models: [
        asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG, null, {
          high: "premium",
        }),
        asSelectable(AUTO_COMPLEX_MODEL_CONFIG, "premium"),
      ],
      query: "",
      streams: null,
    });

    expect(items.map((item) => item.label)).toEqual([
      "Basic",
      "Standard",
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} Light`,
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} Medium`,
    ]);
  });
});
