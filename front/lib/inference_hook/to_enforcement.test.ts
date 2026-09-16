import {
  parseInferenceHookEndpoint,
  toEnforcement,
} from "@app/types/inference_hook";
import { describe, expect, it } from "vitest";

describe("toEnforcement", () => {
  it("maps ALLOW to proceed", () => {
    expect(toEnforcement("ALLOW")).toBe("proceed");
  });

  it("maps DENY to block", () => {
    expect(toEnforcement("DENY")).toBe("block");
  });

  it("maps ABORT to terminate", () => {
    expect(toEnforcement("ABORT")).toBe("terminate");
  });

  it("fails closed on unknown or missing actions", () => {
    expect(toEnforcement(undefined)).toBe("block");
    expect(toEnforcement(null)).toBe("block");
    expect(toEnforcement("ALLOW ")).toBe("block");
    expect(toEnforcement({ action: "ALLOW" })).toBe("block");
    expect(toEnforcement("deny")).toBe("block");
  });
});

describe("parseInferenceHookEndpoint", () => {
  it("accepts https evaluate URLs and normalizes them", () => {
    const parsed = parseInferenceHookEndpoint(
      "https://api.datadoghq.eu/api/v2/ai-guard/evaluate?x=1"
    );
    expect(parsed).toEqual({
      ok: true,
      endpoint: "https://api.datadoghq.eu/api/v2/ai-guard/evaluate",
    });
  });

  it("rejects non-https and wrong paths", () => {
    expect(
      parseInferenceHookEndpoint(
        "http://api.datadoghq.com/api/v2/ai-guard/evaluate"
      ).ok
    ).toBe(false);
    expect(
      parseInferenceHookEndpoint(
        "https://api.datadoghq.com/api/v1/ai-guard/evaluate"
      ).ok
    ).toBe(false);
    expect(parseInferenceHookEndpoint("not-a-url").ok).toBe(false);
  });
});
