import * as metronomeClient from "@app/lib/metronome/client";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
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

function awuPoolSummaryUrl(wId: string) {
  return `/api/w/${wId}/credits/awu-pool-summary`;
}

const EMPTY_POOL_SUMMARY = {
  totalRemainingCredits: 0,
  totalActiveCredits: 0,
  overageCredits: null,
  overageAmountCents: null,
  overageCurrency: null,
  currentCycleStartMs: null,
  currentCycleEndMs: null,
  currentCycleConsumedCredits: null,
  cycleBreakdown: [],
  excessConsumedCredits: null,
  excessCycleBreakdown: [],
  programmaticConsumedCredits: null,
  otherConsumedCredits: null,
};

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

describe("GET /api/w/[wId]/credits/awu-pool-summary", () => {
  it("returns 403 when the caller is a user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(awuPoolSummaryUrl(workspace.sId));

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
    expect(metronomeClient.listMetronomeBalances).not.toHaveBeenCalled();
  });

  it("allows a manager to read the AWU pool summary", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    await createPrivateApiMockRequest({
      method: "GET",
      role: "manager",
      workspace,
    });

    const response = await honoApp.request(awuPoolSummaryUrl(workspace.sId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(EMPTY_POOL_SUMMARY);
    expect(metronomeClient.listMetronomeBalances).toHaveBeenCalled();
  });

  it("allows an admin to read the AWU pool summary", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await honoApp.request(awuPoolSummaryUrl(workspace.sId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(EMPTY_POOL_SUMMARY);
  });
});
