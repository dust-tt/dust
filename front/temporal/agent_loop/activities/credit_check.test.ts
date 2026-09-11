import {
  checkCreditSpendCheckpointActivity,
  checkCreditsActivity,
} from "@app/temporal/agent_loop/activities/credit_check";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFromJson,
  mockCheckPoolCreditGate,
  mockCheckCreditSpendCheckpointGate,
  mockFetchCheckpointState,
  mockListByDustRunIds,
  mockListRunUsagesForRuns,
  mockAwuFromMicroUsd,
} = vi.hoisted(() => ({
  mockFromJson: vi.fn(),
  mockCheckPoolCreditGate: vi.fn(),
  mockCheckCreditSpendCheckpointGate: vi.fn(),
  mockFetchCheckpointState: vi.fn(),
  mockListByDustRunIds: vi.fn(),
  mockListRunUsagesForRuns: vi.fn(),
  mockAwuFromMicroUsd: vi.fn(),
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: { fromJsonWithRefrehedGroups: mockFromJson },
}));

vi.mock("@app/lib/api/assistant/credit_check", () => ({
  checkPoolCreditGate: mockCheckPoolCreditGate,
  checkCreditSpendCheckpointGate: mockCheckCreditSpendCheckpointGate,
}));

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchAgentMessageCreditSpendCheckpointState: mockFetchCheckpointState,
  },
}));

vi.mock("@app/lib/resources/run_resource", () => ({
  RunResource: {
    listByDustRunIds: mockListByDustRunIds,
    listRunUsagesForRuns: mockListRunUsagesForRuns,
  },
}));

vi.mock("@app/lib/credits/agent_message_billing", () => ({
  awuFromMicroUsd: mockAwuFromMicroUsd,
}));

const FAKE_AUTH = {
  getNonNullableWorkspace: () => ({ sId: "ws_test", id: 1 }),
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

describe("checkCreditSpendCheckpointActivity (pure decision)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromJson.mockResolvedValue(FAKE_AUTH);
    mockFetchCheckpointState.mockResolvedValue(null);
    mockListByDustRunIds.mockResolvedValue([]);
    mockListRunUsagesForRuns.mockResolvedValue([]);
    mockAwuFromMicroUsd.mockReturnValue(0);
  });

  it("skips further checks once acknowledged, without consulting the gate", async () => {
    mockFetchCheckpointState.mockResolvedValue({
      status: "acknowledged",
      runIds: ["run_1"],
    });

    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: { agentMessageId: "msg_id" } as never,
    });

    expect(result).toEqual({ crossed: false, skipRemainingChecks: true });
    expect(mockCheckCreditSpendCheckpointGate).not.toHaveBeenCalled();
    expect(mockListByDustRunIds).not.toHaveBeenCalled();
  });

  it("skips the run usage lookup when this message has no runIds yet", async () => {
    mockCheckCreditSpendCheckpointGate.mockResolvedValue({
      crossed: false,
      exempt: false,
    });

    await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(mockListByDustRunIds).not.toHaveBeenCalled();
    expect(mockCheckCreditSpendCheckpointGate).toHaveBeenCalledWith(FAKE_AUTH, {
      consumedAwuCredits: 0,
    });
  });

  it("computes this message's consumed AWU credits from its own runIds and passes them to the gate", async () => {
    mockFetchCheckpointState.mockResolvedValue({
      status: null,
      runIds: ["run_1", "run_2"],
    });
    const fakeRuns = [{ id: 1 }, { id: 2 }];
    mockListByDustRunIds.mockResolvedValue(fakeRuns);
    mockListRunUsagesForRuns.mockResolvedValue([
      { costMicroUsd: 100 },
      { costMicroUsd: 250 },
    ]);
    mockAwuFromMicroUsd.mockReturnValue(42);
    mockCheckCreditSpendCheckpointGate.mockResolvedValue({
      crossed: false,
      exempt: false,
    });

    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(mockListByDustRunIds).toHaveBeenCalledWith(FAKE_AUTH, {
      dustRunIds: ["run_1", "run_2"],
    });
    expect(mockListRunUsagesForRuns).toHaveBeenCalledWith(FAKE_AUTH, {
      runs: fakeRuns,
    });
    expect(mockAwuFromMicroUsd).toHaveBeenCalledWith(350);
    expect(mockCheckCreditSpendCheckpointGate).toHaveBeenCalledWith(FAKE_AUTH, {
      consumedAwuCredits: 42,
    });
    expect(result).toEqual({ crossed: false, skipRemainingChecks: false });
  });

  it("skips further checks when the gate says this execution is exempt", async () => {
    mockCheckCreditSpendCheckpointGate.mockResolvedValue({
      crossed: false,
      exempt: true,
    });

    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(result).toEqual({ crossed: false, skipRemainingChecks: true });
  });

  it("returns the gate's threshold when crossed", async () => {
    mockCheckCreditSpendCheckpointGate.mockResolvedValue({
      crossed: true,
      thresholdAwuCredits: 1500,
    });

    const result = await checkCreditSpendCheckpointActivity({} as never, {
      agentLoopArgs: {} as never,
    });

    expect(result).toEqual({ crossed: true, thresholdAwuCredits: 1500 });
  });
});
