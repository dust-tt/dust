import { beforeEach, describe, expect, it, vi } from "vitest";
import { evalCaseWorkflow, evalRunWorkflow } from "./workflows";

const mocks = vi.hoisted(() => ({
  prepareEvalRun: vi.fn(), pollEvalStep: vi.fn(), launchEvalStep: vi.fn(),
  failEvalStep: vi.fn(), skipPendingEvalSteps: vi.fn(), finishEvalRun: vi.fn(),
  executeChild: vi.fn(),
}));
vi.mock("@temporalio/workflow", () => ({
  proxyActivities: () => mocks,
  CancellationScope: { nonCancellable: (f: () => Promise<unknown>) => f() },
  ParentClosePolicy: { TERMINATE: "TERMINATE" },
  executeChild: mocks.executeChild,
  sleep: async () => {},
  workflowInfo: () => ({ workflowId: "eval-test" }),
}));
const auth = {} as never;
const input = { runId: "run", caseIndex: 0, judgeRuns: 2, timeoutSeconds: 600 };

describe("durable eval orchestration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.launchEvalStep.mockResolvedValue("running");
    mocks.pollEvalStep.mockResolvedValue("completed");
    mocks.prepareEvalRun.mockResolvedValue({ count: 5, concurrency: 2, judgeRuns: 2, timeoutSeconds: 600 });
  });
  it("runs the evaluated agent before the individual judge stages", async () => {
    await evalCaseWorkflow(auth, input);
    expect(mocks.launchEvalStep.mock.calls.map((c) => c[1].voteIndex)).toEqual([-1, 0, 1]);
    expect(mocks.failEvalStep).not.toHaveBeenCalled();
  });
  it("polls the same stage without launching another conversation", async () => {
    mocks.pollEvalStep.mockResolvedValueOnce("running").mockResolvedValue("completed");
    await evalCaseWorkflow(auth, { ...input, judgeRuns: 0 });
    expect(mocks.launchEvalStep).toHaveBeenCalledTimes(1);
    expect(mocks.pollEvalStep).toHaveBeenCalledTimes(2);
    expect(mocks.pollEvalStep.mock.calls[0]).toEqual(mocks.pollEvalStep.mock.calls[1]);
  });
  it("does not rerun completed stages", async () => {
    mocks.launchEvalStep.mockResolvedValue("completed");
    await evalCaseWorkflow(auth, input);
    expect(mocks.pollEvalStep).not.toHaveBeenCalled();
  });
  it("surfaces an ambiguous launch instead of retrying the paid action", async () => {
    mocks.launchEvalStep.mockRejectedValue(new Error("lost response"));
    await evalCaseWorkflow(auth, input);
    expect(mocks.launchEvalStep).toHaveBeenCalledTimes(1);
    expect(mocks.failEvalStep).toHaveBeenCalledTimes(1);
    expect(mocks.skipPendingEvalSteps).toHaveBeenCalledWith(auth, "run", 0);
  });
  it("skips judges after an agent failure", async () => {
    mocks.pollEvalStep.mockResolvedValue("failed");
    await evalCaseWorkflow(auth, input);
    expect(mocks.launchEvalStep).toHaveBeenCalledTimes(1);
    expect(mocks.skipPendingEvalSteps).toHaveBeenCalledTimes(1);
  });
  it("honors cooperative cancellation before launch", async () => {
    mocks.launchEvalStep.mockResolvedValue("cancelled");
    await evalCaseWorkflow(auth, input);
    expect(mocks.pollEvalStep).not.toHaveBeenCalled();
    expect(mocks.skipPendingEvalSteps).toHaveBeenCalledTimes(1);
  });
  it("bounds simultaneously active child cases", async () => {
    let active = 0;
    let peak = 0;
    mocks.executeChild.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
    });
    await evalRunWorkflow(auth, "run");
    expect(peak).toBeLessThanOrEqual(2);
    expect(mocks.executeChild).toHaveBeenCalledTimes(5);
    expect(new Set(mocks.executeChild.mock.calls.map((c) => c[1].workflowId)).size).toBe(5);
    expect(mocks.finishEvalRun).toHaveBeenCalledWith(auth, "run", false);
  });
  it("records fatal infrastructure failure without reporting success", async () => {
    mocks.prepareEvalRun.mockRejectedValue(new Error("no permission"));
    await expect(evalRunWorkflow(auth, "run")).rejects.toThrow("no permission");
    expect(mocks.finishEvalRun).toHaveBeenCalledWith(auth, "run", true);
  });
});
