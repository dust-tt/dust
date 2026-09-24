import { disableReasoningWhenForcingTool } from "@app/lib/llms/stream/types/configuration";
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
