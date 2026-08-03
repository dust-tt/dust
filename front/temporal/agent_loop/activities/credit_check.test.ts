import { checkCreditsActivity } from "@app/temporal/agent_loop/activities/credit_check";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFromJson, mockCheckPoolCreditGate } = vi.hoisted(() => ({
  mockFromJson: vi.fn(),
  mockCheckPoolCreditGate: vi.fn(),
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: { fromJsonWithRefrehedGroups: mockFromJson },
}));

vi.mock("@app/lib/api/assistant/credit_check", () => ({
  checkPoolCreditGate: mockCheckPoolCreditGate,
}));

const FAKE_AUTH = {
  getNonNullableWorkspace: () => ({ sId: "ws_test" }),
} as never;

describe("checkCreditsActivity (pure decision)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromJson.mockResolvedValue(FAKE_AUTH);
  });

  it("returns the gate's no-stop result unchanged", async () => {
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: false,
      reason: null,
    });

    const result = await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(result).toEqual({ shouldStop: false, reason: null });
  });

  it("returns the gate's stop result unchanged", async () => {
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: true,
      reason: "credits_exhausted",
    });

    const result = await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(result).toEqual({ shouldStop: true, reason: "credits_exhausted" });
  });

  it("calls the gate with the resolved auth and this execution's userMessageOrigin", async () => {
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: false,
      reason: null,
    });

    await checkCreditsActivity({} as never, {
      agentLoopArgs: { userMessageOrigin: "api" } as never,
    });

    expect(mockCheckPoolCreditGate).toHaveBeenCalledWith(FAKE_AUTH, {
      userMessageOrigin: "api",
    });
  });

  it("passes userMessageOrigin: null when the args don't carry one", async () => {
    mockCheckPoolCreditGate.mockResolvedValue({
      shouldStop: false,
      reason: null,
    });

    await checkCreditsActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(mockCheckPoolCreditGate).toHaveBeenCalledWith(FAKE_AUTH, {
      userMessageOrigin: null,
    });
  });
});
