import { launchSandboxKillRequesterWorkflow } from "@app/temporal/sandbox_reaper/kill_requester/client";
import { sandboxKillRequesterWorkflow } from "@app/temporal/sandbox_reaper/kill_requester/workflows";
import { WorkflowIdReusePolicy } from "@temporalio/client";
import { WorkflowIdConflictPolicy } from "@temporalio/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockWorkflowStart } = vi.hoisted(() => ({
  mockWorkflowStart: vi.fn(),
}));

vi.mock("@app/lib/temporal", () => ({
  getTemporalClientForFrontNamespace: vi.fn(async () => ({
    workflow: {
      start: mockWorkflowStart,
    },
  })),
}));

describe("launchSandboxKillRequesterWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflowStart.mockResolvedValue(undefined);
  });

  it("reuses the active workflow for duplicate image kill requests", async () => {
    const input = { baseImage: "dust-base", version: "1.2.3" };

    const first = await launchSandboxKillRequesterWorkflow(input);
    const second = await launchSandboxKillRequesterWorkflow(input);

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    if (first.isErr() || second.isErr()) {
      throw new Error("Expected both workflow launches to succeed.");
    }
    expect(first.value.workflowId).toBe(second.value.workflowId);
    expect(mockWorkflowStart).toHaveBeenCalledTimes(2);
    expect(mockWorkflowStart).toHaveBeenCalledWith(
      sandboxKillRequesterWorkflow,
      expect.objectContaining({
        workflowId: "sandbox-kill-requester-dust-base-1.2.3",
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      })
    );
  });
});
