import type { GetAwuUsageResponse } from "@app/lib/api/analytics/awu_usage";
import * as metronomeClient from "@app/lib/metronome/client";
import * as planType from "@app/lib/metronome/plan_type";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<typeof metronomeClient>(
    "@app/lib/metronome/client"
  );
  return { ...actual, listMetronomeUsage: vi.fn() };
});

vi.mock("@app/lib/metronome/plan_type", async () => {
  const actual = await vi.importActual<typeof planType>(
    "@app/lib/metronome/plan_type"
  );
  return { ...actual, getActiveContract: vi.fn() };
});

function awuUsageUrl(wId: string) {
  return `/api/w/${wId}/analytics/awu-usage?billingCycleStartDay=1`;
}

const USAGE_CREDITS = 4200;

function fakeUsage() {
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  return [
    {
      billableMetricId: "metric_awu",
      billableMetricName: "AWU",
      customerId: "cus_test_credit_priced",
      startTimestamp: day.toISOString(),
      endTimestamp: new Date(day.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      value: USAGE_CREDITS,
    },
  ];
}

function totalPointCredits(body: {
  points: { groups: { valueCredits: number }[] }[];
}): number {
  return body.points
    .flatMap((p) => p.groups)
    .reduce((sum, g) => sum + g.valueCredits, 0);
}

beforeEach(() => {
  vi.mocked(metronomeClient.listMetronomeUsage).mockResolvedValue(
    new Ok(fakeUsage())
  );
  vi.mocked(planType.getActiveContract).mockResolvedValue(null);
});

describe("GET /api/w/[wId]/analytics/awu-usage", () => {
  it("returns 403 when the caller is a user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(awuUsageUrl(workspace.sId));

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
    expect(metronomeClient.listMetronomeUsage).not.toHaveBeenCalled();
  });

  it("allows a business admin to read AWU usage", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    await createPrivateApiMockRequest({
      method: "GET",
      role: "business_admin",
      workspace,
    });

    const response = await honoApp.request(awuUsageUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body: GetAwuUsageResponse = await response.json();
    expect(body.availableGroups).toEqual([
      { groupKey: "total", groupLabel: "Total usage" },
    ]);
    expect(totalPointCredits(body)).toBe(USAGE_CREDITS);
    expect(metronomeClient.listMetronomeUsage).toHaveBeenCalled();
  });

  it("allows an admin to read AWU usage", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
      workspace,
    });

    const response = await honoApp.request(awuUsageUrl(workspace.sId));

    expect(response.status).toBe(200);
    const body: GetAwuUsageResponse = await response.json();
    expect(body.availableGroups).toEqual([
      { groupKey: "total", groupLabel: "Total usage" },
    ]);
    expect(totalPointCredits(body)).toBe(USAGE_CREDITS);
  });
});
