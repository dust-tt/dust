import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lookupPhoneNumber } from "./lookup";

const { mockTrustedFetch } = vi.hoisted(() => ({
  mockTrustedFetch: vi.fn(),
}));

vi.mock("@app/lib/egress/server", () => ({
  trustedFetch: mockTrustedFetch,
}));

vi.mock("./client", () => ({
  getPersonaClient: () => ({
    baseUrl: "https://persona.test/api/v1",
    apiKey: "persona_test_key",
  }),
}));

function mockResponse(status: number, data: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

function mockPersonaFlow({
  phoneType,
  riskRecommendation,
  riskScore = 10,
}: {
  phoneType: string;
  riskRecommendation: string;
  riskScore?: number;
}) {
  mockTrustedFetch.mockResolvedValueOnce(
    mockResponse(200, {
      data: { type: "report/phone-number", id: "rep_test_123" },
    }) as never
  );
  mockTrustedFetch.mockResolvedValueOnce(
    mockResponse(200, {
      data: {
        type: "report/phone-number",
        id: "rep_test_123",
        attributes: {
          status: "ready",
          "phone-number": "+4555555555",
          "phone-type": phoneType,
          "phone-carrier": "Test Carrier",
          "phone-risk-level": "low",
          "phone-risk-score": riskScore,
          "phone-risk-recommendation": riskRecommendation,
          "phone-risk-sim-swap": null,
        },
      },
    }) as never
  );
}

describe("Persona phone lookup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockTrustedFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("treats PREPAID as mobile for verification gating", async () => {
    mockPersonaFlow({ phoneType: "PREPAID", riskRecommendation: "allow" });

    const resultPromise = lookupPhoneNumber("+4555555555");
    await vi.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.phoneType).toBe("prepaid");
      expect(result.value.riskRecommendation).toBe("allow");
    }
  });

  it("block recommendation takes precedence over non-mobile phone types", async () => {
    mockPersonaFlow({
      phoneType: "FIXED_LINE",
      riskRecommendation: "block",
      riskScore: 900,
    });

    const resultPromise = lookupPhoneNumber("+4512345678");
    await vi.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("high_risk_blocked");
    }
  });

  it("prepaid numbers can still be rejected when flagged for review", async () => {
    mockPersonaFlow({
      phoneType: "PREPAID",
      riskRecommendation: "flag",
      riskScore: 500,
    });

    const resultPromise = lookupPhoneNumber("+4555555555");
    await vi.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("flagged_for_review");
    }
  });
});
