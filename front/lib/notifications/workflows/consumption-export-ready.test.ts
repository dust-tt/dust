import * as novuClientModule from "@app/lib/notifications/novu-client";
import { notifyConsumptionExportReady } from "@app/lib/notifications/workflows/consumption-export-ready";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { CONSUMPTION_EXPORT_READY_TRIGGER_ID } from "@app/types/notification_preferences";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTriggerBulk = vi.fn();

vi.mock(import("@app/lib/notifications/novu-client"), async (orig) => {
  const mod = await orig();
  return { ...mod, getNovuClient: vi.fn() };
});

beforeEach(() => {
  mockTriggerBulk.mockReset();
  vi.mocked(novuClientModule.getNovuClient).mockResolvedValue({
    triggerBulk: mockTriggerBulk,
  } as unknown as Awaited<ReturnType<typeof novuClientModule.getNovuClient>>);
});

async function setup() {
  const { authenticator, workspace, user } = await createResourceTest({
    role: "admin",
  });
  return { authenticator, workspace, user };
}

// Flushes the fire-and-forget promise chain started by notifyConsumptionExportReady.
async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("notifyConsumptionExportReady", () => {
  it("triggers the workflow for the requesting user with a stable, deduplicating transactionId", async () => {
    mockTriggerBulk.mockResolvedValue({ result: [{}] });
    const { authenticator, workspace, user } = await setup();

    notifyConsumptionExportReady(authenticator, "export-run-1");
    await flush();

    expect(mockTriggerBulk).toHaveBeenCalledTimes(1);
    const call = mockTriggerBulk.mock.calls[0][0];
    expect(call.events).toHaveLength(1);
    const [event] = call.events;

    expect(event.workflowId).toBe(CONSUMPTION_EXPORT_READY_TRIGGER_ID);
    expect(event.to).toEqual({
      subscriberId: user.sId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName ?? undefined,
    });
    expect(event.payload).toEqual({ workspaceId: workspace.sId });

    const firstTransactionId = event.transactionId;
    expect(firstTransactionId).toContain(workspace.sId);
    expect(firstTransactionId).toContain(user.sId);
    expect(firstTransactionId).toContain("export-run-1");

    // A retry of the same export must reuse the exact same transactionId so Novu
    // deduplicates instead of sending a second in-app notification.
    notifyConsumptionExportReady(authenticator, "export-run-1");
    await flush();

    expect(mockTriggerBulk.mock.calls[1][0].events[0].transactionId).toBe(
      firstTransactionId
    );

    // A different export must get a different transactionId.
    notifyConsumptionExportReady(authenticator, "export-run-2");
    await flush();

    expect(mockTriggerBulk.mock.calls[2][0].events[0].transactionId).not.toBe(
      firstTransactionId
    );
  });

  it("logs an error without throwing when Novu reports a per-event error", async () => {
    mockTriggerBulk.mockResolvedValue({ result: [{ error: ["boom"] }] });
    const { authenticator } = await setup();

    expect(() =>
      notifyConsumptionExportReady(authenticator, "export-run-1")
    ).not.toThrow();
    await flush();

    expect(mockTriggerBulk).toHaveBeenCalledTimes(1);
  });

  it("logs an error without throwing when the Novu call rejects", async () => {
    mockTriggerBulk.mockRejectedValue(new Error("network error"));
    const { authenticator } = await setup();

    expect(() =>
      notifyConsumptionExportReady(authenticator, "export-run-1")
    ).not.toThrow();
    await flush();

    expect(mockTriggerBulk).toHaveBeenCalledTimes(1);
  });
});
