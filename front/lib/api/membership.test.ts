import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { createAndTrackMembership } from "@app/lib/api/membership";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import * as planType from "@app/lib/metronome/plan_type";
import * as seatTypes from "@app/lib/metronome/seat_types";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipSeatType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/plan_type", async () => {
  const actual = await vi.importActual<typeof planType>(
    "@app/lib/metronome/plan_type"
  );
  return { ...actual, getActiveContract: vi.fn() };
});

vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<typeof seatTypes>(
    "@app/lib/metronome/seat_types"
  );
  return { ...actual, getProductSeatTypes: vi.fn() };
});

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return { ...actual, emitAuditLogEventDirect: vi.fn() };
});

vi.mock("@app/temporal/usage_queue/client", async () => {
  const actual = await vi.importActual<
    typeof import("@app/temporal/usage_queue/client")
  >("@app/temporal/usage_queue/client");
  return {
    ...actual,
    launchMetronomeSeatCountSyncWorkflow: vi.fn(),
    launchUpdateUsageWorkflow: vi.fn(),
  };
});

import {
  launchMetronomeSeatCountSyncWorkflow,
  launchUpdateUsageWorkflow,
} from "@app/temporal/usage_queue/client";

const trackCreateMembershipSpy = vi.spyOn(
  ServerSideTracking,
  "trackCreateMembership"
);

function setupEntitledSeats(seatTypeList: MembershipSeatType[]): void {
  const contract = {
    subscriptions: seatTypeList.map((seatType) => ({
      subscription_rate: {
        product: { id: `${seatType}-product`, name: seatType },
      },
    })),
    recurring_credits: [],
    overrides: seatTypeList.map((seatType) => ({
      entitled: true,
      product: { id: `${seatType}-product` },
    })),
  } as unknown as CachedContract;

  const catalog = new Map<string, MembershipSeatType>(
    seatTypeList.map((seatType) => [`${seatType}-product`, seatType])
  );

  vi.mocked(planType.getActiveContract).mockResolvedValue(contract);
  vi.mocked(seatTypes.getProductSeatTypes).mockResolvedValue(catalog);
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(workosAudit.emitAuditLogEventDirect).mockResolvedValue(undefined);
  vi.mocked(launchUpdateUsageWorkflow).mockResolvedValue(new Ok(undefined));
  vi.mocked(launchMetronomeSeatCountSyncWorkflow).mockResolvedValue(
    new Ok(undefined)
  );
  trackCreateMembershipSpy.mockResolvedValue(undefined);
});

describe("createAndTrackMembership", () => {
  it("assigns free instead of a committed paid seat on a free plan", async () => {
    setupEntitledSeats(["free", "pro"]);

    const workspace = await WorkspaceFactory.creditPricedFree();
    const upsertResult = await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 3,
      maxSeats: null,
    });
    expect(upsertResult.isOk()).toBe(true);

    const user = await UserFactory.basic();
    const membership = await createAndTrackMembership({
      user,
      workspace,
      role: "user",
      origin: "invited",
    });

    expect(membership.seatType).toBe("free");
  });

  it("drops a requested paid seat and still assigns free on a free plan", async () => {
    setupEntitledSeats(["free", "pro"]);

    const workspace = await WorkspaceFactory.creditPricedFree();
    const user = await UserFactory.basic();
    const membership = await createAndTrackMembership({
      user,
      workspace,
      role: "user",
      origin: "invited",
      requestedSeatType: "pro",
    });

    expect(membership.seatType).toBe("free");
  });

  it("preserves an explicit none seat request on a free plan", async () => {
    setupEntitledSeats(["free", "pro"]);

    const workspace = await WorkspaceFactory.creditPricedFree();
    const user = await UserFactory.basic();
    const membership = await createAndTrackMembership({
      user,
      workspace,
      role: "user",
      origin: "invited",
      requestedSeatType: "none",
    });

    expect(membership.seatType).toBe("none");
  });

  it("still assigns a committed paid seat on a paid plan", async () => {
    setupEntitledSeats(["free", "pro"]);

    const workspace = await WorkspaceFactory.creditPriced();
    const upsertResult = await WorkspaceSeatLimitResource.upsert({
      workspace,
      seatType: "pro",
      minSeats: 3,
      maxSeats: null,
    });
    expect(upsertResult.isOk()).toBe(true);

    const user = await UserFactory.basic();
    const membership = await createAndTrackMembership({
      user,
      workspace,
      role: "user",
      origin: "invited",
    });

    expect(membership.seatType).toBe("pro");
  });
});
