import {
  applyHookPolicy,
  parseInferenceHookEndpoint,
  parseInferenceHookTimeoutMs,
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

  it("maps unknown actions to block before policy", () => {
    expect(toEnforcement(undefined)).toBe("block");
    expect(toEnforcement(null)).toBe("block");
    expect(toEnforcement("ALLOW ")).toBe("block");
    expect(toEnforcement({ action: "ALLOW" })).toBe("block");
    expect(toEnforcement("deny")).toBe("block");
  });
});

describe("applyHookPolicy", () => {
  const closedBlock = {
    enforcementMode: "block" as const,
    failMode: "closed" as const,
    timeoutMs: 1000,
  };
  const openMonitor = {
    enforcementMode: "monitor" as const,
    failMode: "open" as const,
    timeoutMs: 500,
  };

  it("fail-closed blocks on transport failure", () => {
    expect(
      applyHookPolicy({
        providerRuling: "proceed",
        policy: closedBlock,
        isFailure: true,
      })
    ).toBe("block");
  });

  it("fail-open proceeds on transport failure", () => {
    expect(
      applyHookPolicy({
        providerRuling: "block",
        policy: openMonitor,
        isFailure: true,
      })
    ).toBe("proceed");
  });

  it("monitor mode proceeds even when provider would block", () => {
    expect(
      applyHookPolicy({
        providerRuling: "terminate",
        policy: openMonitor,
        isFailure: false,
      })
    ).toBe("proceed");
  });

  it("block mode keeps the provider ruling", () => {
    expect(
      applyHookPolicy({
        providerRuling: "terminate",
        policy: closedBlock,
        isFailure: false,
      })
    ).toBe("terminate");
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

describe("parseInferenceHookTimeoutMs", () => {
  it("accepts 1..1000", () => {
    expect(parseInferenceHookTimeoutMs(1)).toEqual({ ok: true, timeoutMs: 1 });
    expect(parseInferenceHookTimeoutMs(1000)).toEqual({
      ok: true,
      timeoutMs: 1000,
    });
  });

  it("rejects above the hard cap", () => {
    expect(parseInferenceHookTimeoutMs(1001).ok).toBe(false);
    expect(parseInferenceHookTimeoutMs(0).ok).toBe(false);
  });
});
