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

const USD_CREDIT_TYPE = {
  id: "2714e483-4ff1-48e4-9e25-ac732e8f24f2",
  name: "USD",
};

// `overageCredits` makes the invoice a cycle with consumption in the excess breakdown.
function finalizedInvoice(index: number, overageCredits = 0): Invoice {
  const end = Date.UTC(2026, 0, 1) - index * 31 * 24 * 60 * 60 * 1000;
  return {
    id: `inv-${index}`,
    customer_id: "m-customer",
    status: "FINALIZED",
    type: "USAGE",
    total: overageCredits,
    start_timestamp: new Date(end - 31 * 24 * 60 * 60 * 1000).toISOString(),
    end_timestamp: new Date(end).toISOString(),
    credit_type: USD_CREDIT_TYPE,
    line_items:
      overageCredits > 0
        ? [
            {
              type: "cpu_conversion",
              name: "Overage",
              quantity: overageCredits,
              total: overageCredits,
              credit_type: USD_CREDIT_TYPE,
            },
          ]
        : [],
  };
}

function cycleIds(cycles: { cycleEndMs: number | null }[]): string[] {
  return cycles.map(
    (cycle) =>
      `inv-${Math.round((Date.UTC(2026, 0, 1) - (cycle.cycleEndMs ?? 0)) / (31 * 24 * 60 * 60 * 1000))}`
  );
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

  it("scans a fixed window of invoices regardless of the limit", async () => {
    const response = await requestAsManager("?cycleHistoryLimit=2");

    expect(response.status).toBe(200);
    expect(metronomeClient.listMetronomeFinalizedInvoices).toHaveBeenCalledWith(
      expect.any(String),
      { limit: 48 }
    );
  });

  it("skips invoices without consumption when filling the limit", async () => {
    vi.mocked(metronomeClient.listMetronomeFinalizedInvoices).mockResolvedValue(
      new Ok([
        finalizedInvoice(0, 10),
        finalizedInvoice(1),
        finalizedInvoice(2),
        finalizedInvoice(3, 20),
        finalizedInvoice(4, 30),
      ])
    );

    const response = await requestAsManager("?cycleHistoryLimit=2");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(cycleIds(body.excessCycleBreakdown)).toEqual(["inv-0", "inv-3"]);
    expect(body.hasMoreCycleHistory).toBe(true);
  });

  it("reports no more history when the remaining invoices have no consumption", async () => {
    vi.mocked(metronomeClient.listMetronomeFinalizedInvoices).mockResolvedValue(
      new Ok([
        finalizedInvoice(0, 10),
        finalizedInvoice(1, 20),
        finalizedInvoice(2),
        finalizedInvoice(3),
      ])
    );

    const response = await requestAsManager("?cycleHistoryLimit=2");
    const body = await response.json();

    expect(cycleIds(body.excessCycleBreakdown)).toEqual(["inv-0", "inv-1"]);
    expect(body.hasMoreCycleHistory).toBe(false);
  });

  it("reports no more history at the 24 cycle cap even when more exist", async () => {
    vi.mocked(metronomeClient.listMetronomeFinalizedInvoices).mockResolvedValue(
      new Ok(Array.from({ length: 30 }, (_, i) => finalizedInvoice(i, 10)))
    );

    const response = await requestAsManager("?cycleHistoryLimit=24");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.excessCycleBreakdown).toHaveLength(24);
    expect(body.hasMoreCycleHistory).toBe(false);
  });

  it("falls back to the default limit when the requested one is out of range", async () => {
    vi.mocked(metronomeClient.listMetronomeFinalizedInvoices).mockResolvedValue(
      new Ok(Array.from({ length: 8 }, (_, i) => finalizedInvoice(i, 10)))
    );

    const response = await requestAsManager("?cycleHistoryLimit=25");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.excessCycleBreakdown).toHaveLength(5);
    expect(body.hasMoreCycleHistory).toBe(true);
  });
});
