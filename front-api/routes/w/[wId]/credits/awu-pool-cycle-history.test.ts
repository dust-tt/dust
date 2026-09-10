import * as metronomeClient from "@app/lib/metronome/client";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import type { Invoice } from "@metronome/sdk/resources/v1/customers";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<typeof metronomeClient>(
    "@app/lib/metronome/client"
  );
  return {
    ...actual,
    listMetronomeBalances: vi.fn(),
    listMetronomeDraftInvoices: vi.fn(),
    listMetronomeFinalizedInvoices: vi.fn(),
  };
});

function awuPoolCycleHistoryUrl(wId: string, query = "") {
  return `/api/w/${wId}/credits/awu-pool-cycle-history${query}`;
}

// Only the fields the breakdown reads; the SDK type is far larger.
function finalizedInvoice(index: number): Invoice {
  const end = Date.UTC(2026, 0, 1) - index * 31 * 24 * 60 * 60 * 1000;
  return {
    id: `inv-${index}`,
    start_timestamp: new Date(end - 31 * 24 * 60 * 60 * 1000).toISOString(),
    end_timestamp: new Date(end).toISOString(),
    credit_type: { id: "2714e483-4ff1-48e4-9e25-ac732e8f24f2", name: "USD" },
    line_items: [],
  } as unknown as Invoice;
}

async function requestAsManager(query = "") {
  const workspace = await WorkspaceFactory.creditPriced();
  await createPrivateApiMockRequest({
    method: "GET",
    role: "manager",
    workspace,
  });
  return honoApp.request(awuPoolCycleHistoryUrl(workspace.sId, query));
}

beforeEach(() => {
  vi.mocked(metronomeClient.listMetronomeBalances).mockResolvedValue(
    new Ok([])
  );
  vi.mocked(metronomeClient.listMetronomeDraftInvoices).mockResolvedValue(
    new Ok([])
  );
  vi.mocked(metronomeClient.listMetronomeFinalizedInvoices).mockResolvedValue(
    new Ok([])
  );
});

describe("GET /api/w/[wId]/credits/awu-pool-cycle-history", () => {
  it("returns 403 when the caller is a user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(
      awuPoolCycleHistoryUrl(workspace.sId)
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
    expect(
      metronomeClient.listMetronomeFinalizedInvoices
    ).not.toHaveBeenCalled();
  });

  it("allows a manager to read the AWU pool cycle history", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    await createPrivateApiMockRequest({
      method: "GET",
      role: "manager",
      workspace,
    });

    const response = await honoApp.request(
      awuPoolCycleHistoryUrl(workspace.sId)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      cycleBreakdown: [],
      excessCycleBreakdown: [],
      hasMoreCycleHistory: false,
    });
    expect(metronomeClient.listMetronomeFinalizedInvoices).toHaveBeenCalled();
  });

  it("fetches one invoice past the limit to detect older cycles", async () => {
    vi.mocked(metronomeClient.listMetronomeFinalizedInvoices).mockResolvedValue(
      new Ok([finalizedInvoice(0), finalizedInvoice(1), finalizedInvoice(2)])
    );

    const response = await requestAsManager("?cycleHistoryLimit=2");

    expect(response.status).toBe(200);
    expect((await response.json()).hasMoreCycleHistory).toBe(true);
    expect(metronomeClient.listMetronomeFinalizedInvoices).toHaveBeenCalledWith(
      expect.any(String),
      { limit: 3 }
    );
  });

  it("reports no more history when the invoices run out", async () => {
    vi.mocked(metronomeClient.listMetronomeFinalizedInvoices).mockResolvedValue(
      new Ok([finalizedInvoice(0), finalizedInvoice(1)])
    );

    const response = await requestAsManager("?cycleHistoryLimit=2");

    expect((await response.json()).hasMoreCycleHistory).toBe(false);
  });

  it("caps the limit at 24 cycles", async () => {
    const response = await requestAsManager("?cycleHistoryLimit=24");

    expect(response.status).toBe(200);
    expect(metronomeClient.listMetronomeFinalizedInvoices).toHaveBeenCalledWith(
      expect.any(String),
      { limit: 25 }
    );
  });

  it("falls back to the default limit when the requested one is out of range", async () => {
    const response = await requestAsManager("?cycleHistoryLimit=25");

    expect(response.status).toBe(200);
    expect(metronomeClient.listMetronomeFinalizedInvoices).toHaveBeenCalledWith(
      expect.any(String),
      { limit: 6 }
    );
  });
});
