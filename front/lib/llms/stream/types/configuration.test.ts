import {
  disableReasoningWhenForcingTool,
  mapReasoningEffortToLowHighMax,
} from "@app/lib/llms/stream/types/configuration";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { describe, expect, it } from "vitest";

describe("disableReasoningWhenForcingTool", () => {
  it("forces reasoning to none when a tool is forced", () => {
    const config: InputConfig = {
      forceTool: "some_tool",
      reasoning: { effort: "low" },
      temperature: 0.2,
    };

    expect(disableReasoningWhenForcingTool(config)).toEqual({
      ...config,
      reasoning: { effort: "none" },
    });
  });

  it("leaves reasoning untouched when no tool is forced", () => {
    const config: InputConfig = {
      reasoning: { effort: "low" },
      temperature: 0.2,
    };

    expect(disableReasoningWhenForcingTool(config)).toBe(config);
  });
});

// Shared by every model whose provider exposes low/high/max rather than Dust's
// light/medium/high ladder (Kimi K3, DeepSeek V4 Flash/Pro, GLM-5.3, GLM-5.3
// Flash), so it is pinned here once rather than in each model's test.
describe("mapReasoningEffortToLowHighMax", () => {
  const map = (effort: InputConfig["reasoning"]) =>
    mapReasoningEffortToLowHighMax({ reasoning: effort }).reasoning;

  it("folds `medium` onto `high` and `high` onto `maximal`", () => {
    expect(map({ effort: "medium" })).toEqual({ effort: "high" });
    expect(map({ effort: "high" })).toEqual({ effort: "maximal" });
  });

  it("passes through the efforts the provider already accepts", () => {
    expect(map({ effort: "low" })).toEqual({ effort: "low" });
    expect(map({ effort: "maximal" })).toEqual({ effort: "maximal" });
  });

  it("leaves an absent reasoning config alone", () => {
    const config: InputConfig = { temperature: 0.2 };

    expect(mapReasoningEffortToLowHighMax(config)).toBe(config);
  });

  it("preserves the rest of the config", () => {
    expect(
      mapReasoningEffortToLowHighMax({
        reasoning: { effort: "high" },
        temperature: 0.2,
        forceTool: "some_tool",
      })
    ).toEqual({
      reasoning: { effort: "maximal" },
      temperature: 0.2,
      forceTool: "some_tool",
    });
  });
});
