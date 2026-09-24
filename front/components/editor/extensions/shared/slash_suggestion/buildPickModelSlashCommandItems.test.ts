import {
  buildPickModelSlashCommandItems,
  getDefaultPickModelSlashCommandItemId,
} from "@app/components/editor/extensions/shared/slash_suggestion/buildPickModelSlashCommandItems";
import type {
  EnabledModelConfigurationType,
  ModelStreamResolutionType,
} from "@app/types/api/assistant/models";
import {
  CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import {
  AUTO_COMPLEX_MODEL_CONFIG,
  AUTO_COMPLEX_MODEL_ID,
  AUTO_FAST_MODEL_ID,
  AUTO_MODEL_ID,
} from "@app/types/assistant/models/auto";
import { GEMINI_3_1_FLASH_LITE_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";
import { MISTRAL_MEDIUM_3_5_MODEL_CONFIG } from "@app/types/assistant/models/mistral";
import {
  GPT_4_1_MODEL_CONFIG,
  GPT_5_4_MINI_MODEL_CONFIG,
  GPT_5_6_LUNA_MODEL_CONFIG,
  GPT_5_MINI_MODEL_CONFIG,
  GPT_5_MODEL_CONFIG,
  GPT_6_ASTRA_MODEL_CONFIG,
} from "@app/types/assistant/models/openai";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { describe, expect, it } from "vitest";

const Icon = () => null;

const SONNET_5_EFFORT_LABELS = ["", "Low", "Medium", "High", "XHigh", "Max"];

// Row labels of a model at the given effort labels; the `none` row has no suffix.
function rowLabels(
  model: ModelConfigurationType,
  effortLabels: string[]
): string[] {
  return effortLabels.map((label) =>
    label ? `${model.displayName} ${label}` : model.displayName
  );
}

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
      streams: null,
    });

    expect(items.map((item) => item.label)).toEqual([
      "Basic",
      "Standard",
      "Premium",
      CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName,
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} Low`,
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} Medium`,
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} High`,
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} XHigh`,
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} Max`,
    ]);
    expect(
      items
        .filter((item) => item.data.selection.display.kind === "model")
        .map((item) => item.data.selection.toSend?.reasoningEffort)
    ).toEqual(["none", "low", "medium", "high", "xhigh", "maximal"]);
  });

  it("uses a single row for non-reasoning models", () => {
    const items = buildPickModelSlashCommandItems({
      getModelIcon: () => Icon,
      lockPremiumEfforts: false,
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
      lockPremiumEfforts: false,
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
        lockPremiumEfforts: false,
        models: [
          asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG),
          asSelectable(GPT_4_1_MODEL_CONFIG),
        ],
        query: "claude",
        streams: null,
      }).map((item) => item.data.selection.toSend?.modelId)
    ).toEqual(
      SONNET_5_EFFORT_LABELS.map(
        () => CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.modelId
      )
    );
  });

  it("matches the name as a subsequence and ranks tighter matches first", () => {
    const labelsFor = (query: string) =>
      buildPickModelSlashCommandItems({
        getModelIcon: () => Icon,
        lockPremiumEfforts: false,
        models: [
          asSelectable(GPT_5_6_LUNA_MODEL_CONFIG),
          asSelectable(GPT_6_ASTRA_MODEL_CONFIG),
          asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG),
        ],
        query,
        streams: null,
      }).map((item) => item.label);

    // "gpt6" is a substring of "gpt6astra" and only a subsequence of "gpt5.6luna". Within a
    // model, efforts keep their slider order.
    expect(labelsFor("gpt6")).toEqual([
      ...rowLabels(GPT_6_ASTRA_MODEL_CONFIG, [
        "Low",
        "Medium",
        "High",
        "XHigh",
        "Max",
      ]),
      ...rowLabels(GPT_5_6_LUNA_MODEL_CONFIG, SONNET_5_EFFORT_LABELS),
    ]);
    expect(labelsFor("laude")).toEqual(
      rowLabels(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG, SONNET_5_EFFORT_LABELS)
    );
    // Provider names are never searched.
    expect(labelsFor("anthropic")).toEqual([]);
  });

  it("selects the effort with a trailing word", () => {
    const labelsFor = (query: string) =>
      buildPickModelSlashCommandItems({
        getModelIcon: () => Icon,
        lockPremiumEfforts: false,
        models: [
          asSelectable(CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG),
          asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG),
          asSelectable(GPT_5_6_LUNA_MODEL_CONFIG),
          asSelectable(GPT_5_4_MINI_MODEL_CONFIG),
        ],
        query,
        streams: null,
      }).map((item) => item.label);

    const haikuHigh = `${CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG.displayName} High`;
    expect(labelsFor("haiku h")).toEqual([haikuHigh]);
    expect(labelsFor("claudehaiku h")).toEqual([haikuHigh]);
    expect(labelsFor("HAIKU High")).toEqual([haikuHigh]);
    expect(labelsFor("gptluna l")).toEqual([
      `${GPT_5_6_LUNA_MODEL_CONFIG.displayName} Low`,
    ]);
    // A displayed name can be typed as is, hyphen included.
    expect(labelsFor(`${GPT_5_4_MINI_MODEL_CONFIG.displayName} h`)).toEqual([
      `${GPT_5_4_MINI_MODEL_CONFIG.displayName} High`,
    ]);
    expect(labelsFor("claude h")).toEqual([
      haikuHigh,
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} High`,
    ]);
    // An effort word alone keeps every row at that effort.
    expect(labelsFor("me")).toEqual([
      `${CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG.displayName} Medium`,
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} Medium`,
      `${GPT_5_6_LUNA_MODEL_CONFIG.displayName} Medium`,
      `${GPT_5_4_MINI_MODEL_CONFIG.displayName} Medium`,
    ]);
  });

  it("keeps an effort word that belongs to a model's name", () => {
    const labelsFor = (query: string) =>
      buildPickModelSlashCommandItems({
        getModelIcon: () => Icon,
        lockPremiumEfforts: false,
        models: [
          asSelectable(MISTRAL_MEDIUM_3_5_MODEL_CONFIG),
          asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG),
        ],
        query,
        streams: null,
      }).map((item) => item.label);

    // Mistral Medium 3.5 only offers the none and high efforts.
    const mistralMediumNone = MISTRAL_MEDIUM_3_5_MODEL_CONFIG.displayName;
    const mistralMediumHigh = `${MISTRAL_MEDIUM_3_5_MODEL_CONFIG.displayName} High`;
    expect(labelsFor("mistral medium")).toEqual([
      mistralMediumNone,
      mistralMediumHigh,
    ]);
    expect(labelsFor("mistral me")).toEqual([
      mistralMediumNone,
      mistralMediumHigh,
    ]);
    expect(labelsFor("mistral medium h")).toEqual([mistralMediumHigh]);
    expect(labelsFor("mistral h")).toEqual([mistralMediumHigh]);
    // Other models still read the trailing word as the effort.
    expect(labelsFor("claude me")).toEqual([
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} Medium`,
    ]);
    // An effort word alone never reaches into names.
    for (const query of ["m", "me", "medium"]) {
      expect(labelsFor(query)).toEqual([
        `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} Medium`,
      ]);
    }
  });

  it("selects every effort on a prefix, medium winning on m", () => {
    const labelsFor = (query: string) =>
      buildPickModelSlashCommandItems({
        getModelIcon: () => Icon,
        lockPremiumEfforts: false,
        models: [asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG)],
        query,
        streams: null,
      }).map((item) => item.label);

    const sonnet = CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName;
    expect(labelsFor("sonnet m")).toEqual([`${sonnet} Medium`]);
    expect(labelsFor("sonnet ma")).toEqual([`${sonnet} Max`]);
    expect(labelsFor("sonnet maximal")).toEqual([`${sonnet} Max`]);
    expect(labelsFor("sonnet x")).toEqual([`${sonnet} XHigh`]);
    expect(labelsFor("sonnet n")).toEqual([sonnet]);
    expect(labelsFor("sonnet mi")).toEqual([]);
  });

  it("lists a model named by the last word at every effort, then others at that effort", () => {
    const labelsFor = (query: string) =>
      buildPickModelSlashCommandItems({
        getModelIcon: () => Icon,
        lockPremiumEfforts: false,
        models: [
          asSelectable(GPT_5_MODEL_CONFIG),
          asSelectable(GPT_5_MINI_MODEL_CONFIG),
          asSelectable(GPT_5_4_MINI_MODEL_CONFIG),
          asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG),
        ],
        query,
        streams: null,
      }).map((item) => item.label);

    const gpt5MiniRows = rowLabels(GPT_5_MINI_MODEL_CONFIG, [
      "Min",
      "Low",
      "Medium",
      "High",
    ]);
    const gpt54MiniRows = rowLabels(GPT_5_4_MINI_MODEL_CONFIG, [
      "",
      "Low",
      "Medium",
      "High",
      "XHigh",
    ]);
    const gpt5Min = `${GPT_5_MODEL_CONFIG.displayName} Min`;
    expect(labelsFor("gpt mini")).toEqual([
      ...gpt5MiniRows,
      ...gpt54MiniRows,
      gpt5Min,
    ]);
    expect(labelsFor("gpt mi")).toEqual([
      ...gpt5MiniRows,
      ...gpt54MiniRows,
      gpt5Min,
    ]);
    expect(labelsFor("mini")).toEqual([
      gpt5Min,
      `${GPT_5_MINI_MODEL_CONFIG.displayName} Min`,
    ]);
  });

  it("matches tier rows on their name and never on an effort", () => {
    const highResolution: ModelStreamResolutionType = {
      providerId: CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.modelId,
      displayName: CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName,
      reasoningEffort: "high",
    };
    const itemsFor = (query: string) =>
      buildPickModelSlashCommandItems({
        getModelIcon: () => Icon,
        lockPremiumEfforts: false,
        models: [asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG)],
        query,
        streams: {
          [AUTO_FAST_MODEL_ID]: highResolution,
          [AUTO_MODEL_ID]: highResolution,
          [AUTO_COMPLEX_MODEL_ID]: highResolution,
        },
      });

    // Every tier description ends with "High", none of it is searched.
    expect(itemsFor("").map((item) => item.description)).toContain(
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} High`
    );
    expect(itemsFor("prem").map((item) => item.label)).toEqual(["Premium"]);
    expect(itemsFor("high").map((item) => item.label)).toEqual([
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.displayName} High`,
    ]);
  });

  it("omits a tier whose stream is above the member's model-tier cap", () => {
    const items = buildPickModelSlashCommandItems({
      getModelIcon: () => Icon,
      lockPremiumEfforts: false,
      models: [
        asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG),
        { ...AUTO_COMPLEX_MODEL_CONFIG, isSelectable: false },
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

  it("omits premium efforts and the Premium tier when gated", () => {
    const items = buildPickModelSlashCommandItems({
      getModelIcon: () => Icon,
      lockPremiumEfforts: true,
      models: [asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG)],
      query: "",
      streams: null,
    });

    expect(items.map((item) => item.label)).toEqual([
      "Basic",
      "Standard",
      ...rowLabels(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG, ["", "Low", "Medium"]),
    ]);
  });
});

describe("getDefaultPickModelSlashCommandItemId", () => {
  const itemsFor = (query: string) =>
    buildPickModelSlashCommandItems({
      getModelIcon: () => Icon,
      lockPremiumEfforts: false,
      models: [asSelectable(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG)],
      query,
      streams: null,
    });

  it("points at the first model's initial effort row", () => {
    expect(
      getDefaultPickModelSlashCommandItemId(itemsFor("claude"), {
        lockPremiumEfforts: false,
      })
    ).toBe(
      `${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.providerId}/${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.modelId}/${CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.defaultReasoningEffort}`
    );
  });

  it("returns null when the list starts with a tier or lacks that effort row", () => {
    expect(
      getDefaultPickModelSlashCommandItemId(itemsFor(""), {
        lockPremiumEfforts: false,
      })
    ).toBeNull();
    expect(
      getDefaultPickModelSlashCommandItemId(itemsFor("claude me"), {
        lockPremiumEfforts: false,
      })
    ).toBeNull();
  });
});
