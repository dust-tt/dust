import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/api/config")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      getMetronomeWebhookSecret: vi.fn().mockReturnValue("test-secret"),
    },
  };
});

vi.mock("@app/lib/metronome/client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/metronome/client")>();
  return {
    ...actual,
    unwrapMetronomeWebhook: vi.fn((rawBody: string) => JSON.parse(rawBody)),
  };
});

vi.mock("@app/temporal/metronome_events_queue/client", () => ({
  launchMetronomeEventsWorkflow: vi.fn(),
}));

import { launchMetronomeEventsWorkflow } from "@app/temporal/metronome_events_queue/client";

async function postContractStart(customerId: string) {
  return honoApp.request("/api/metronome/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "contract.start",
      id: `evt_${customerId}`,
      timestamp: new Date().toISOString(),
      contract_id: "contract_1",
      customer_id: customerId,
    }),
  });
}

describe("POST /api/metronome/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(launchMetronomeEventsWorkflow).mockResolvedValue(
      new Ok("started")
    );
  });

  it("enqueues events for a workspace that is not under maintenance", async () => {
    const customerId = `cus_${Date.now()}`;
    const workspace = await WorkspaceFactory.basic({
      metronomeCustomerId: customerId,
    });

    const response = await postContractStart(customerId);

    expect(response.status).toBe(200);
    expect(launchMetronomeEventsWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: workspace.sId })
    );
  });

  it("acks and skips events for a relocated workspace", async () => {
    const customerId = `cus_${Date.now()}_done`;
    const workspace = await WorkspaceFactory.basic({
      metronomeCustomerId: customerId,
    });
    await WorkspaceResource.updateMetadata(workspace.id, {
      maintenance: "relocation-done",
    });

    const response = await postContractStart(customerId);

    expect(response.status).toBe(200);
    expect(launchMetronomeEventsWorkflow).not.toHaveBeenCalled();
  });

  it("returns 503 for a workspace being relocated", async () => {
    const customerId = `cus_${Date.now()}_relocating`;
    const workspace = await WorkspaceFactory.basic({
      metronomeCustomerId: customerId,
    });
    await WorkspaceResource.updateMetadata(workspace.id, {
      maintenance: "relocation",
    });

    const response = await postContractStart(customerId);

    expect(response.status).toBe(503);
    expect(launchMetronomeEventsWorkflow).not.toHaveBeenCalled();
  });
});
