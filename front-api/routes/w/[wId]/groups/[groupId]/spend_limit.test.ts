import * as spendLimits from "@app/lib/metronome/alerts/spend_limits";
import * as planType from "@app/lib/metronome/plan_type";
import * as seatTypes from "@app/lib/metronome/seat_types";
import { GroupResource } from "@app/lib/resources/group_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipSeatType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import type { Subscription } from "@metronome/sdk/resources";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/alerts/spend_limits", async () => {
  const actual = await vi.importActual<typeof spendLimits>(
    "@app/lib/metronome/alerts/spend_limits"
  );
  return {
    ...actual,
    upsertMetronomeGroupCapAlertForSeatType: vi.fn(),
    upsertMetronomeGroupWarningAlertForSeatType: vi.fn(),
    clearMetronomeGroupCapAlertForSeatType: vi.fn(),
    clearMetronomeGroupWarningAlertForSeatType: vi.fn(),
  };
});

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
  return {
    ...actual,
    getProductSeatTypes: vi.fn(),
    getSeatSubscriptionsFromContract: vi.fn(),
    getAwuAllocationForNormalizedSeatType: vi.fn(),
  };
});

const TEST_METRONOME_CUSTOMER_ID = "cust_test_xxx";
const TEST_ALERT_ID = "alert_test_xxx";

// Minimal fake contract with one pro seat subscription so the alert sync
// resolves a single seat type with an 8000 AWU allowance.
const FAKE_CONTRACT = {
  id: "contract_xxx",
  customer_id: TEST_METRONOME_CUSTOMER_ID,
  rate_card_id: "rc_xxx",
  subscriptions: [],
} as unknown as planType.CachedContract;

async function makeMetronomeWorkspaceWithCustomer(): Promise<WorkspaceType> {
  return WorkspaceFactory.metronome({
    metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
  });
}

async function makeProvisionedGroup(
  workspace: WorkspaceType
): Promise<GroupResource> {
  return GroupResource.makeNew({
    name: "Sales",
    workspaceId: workspace.id,
    kind: "provisioned",
    workOSGroupId: "fake-sales",
  });
}

function groupSpendLimitUrl(wId: string, groupId: string) {
  return `/api/w/${wId}/groups/${groupId}/spend_limit`;
}

function putLimit(
  wId: string,
  groupId: string,
  body: Record<string, unknown>
) {
  return honoApp.request(groupSpendLimitUrl(wId, groupId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(
    spendLimits.upsertMetronomeGroupCapAlertForSeatType
  ).mockResolvedValue(new Ok({ alertId: TEST_ALERT_ID }));
  vi.mocked(
    spendLimits.upsertMetronomeGroupWarningAlertForSeatType
  ).mockResolvedValue(new Ok({ alertId: TEST_ALERT_ID }));
  vi.mocked(
    spendLimits.clearMetronomeGroupCapAlertForSeatType
  ).mockResolvedValue(new Ok(undefined));
  vi.mocked(
    spendLimits.clearMetronomeGroupWarningAlertForSeatType
  ).mockResolvedValue(new Ok(undefined));

  vi.mocked(planType.getActiveContract).mockResolvedValue(FAKE_CONTRACT);
  vi.mocked(seatTypes.getProductSeatTypes).mockResolvedValue(
    new Map([["prod_pro", "pro"]])
  );
  vi.mocked(seatTypes.getSeatSubscriptionsFromContract).mockReturnValue(
    new Map<MembershipSeatType, Subscription>([
      [
        "pro",
        { subscription_rate: { product: { id: "prod_pro" } } } as Subscription,
      ],
    ])
  );
  vi.mocked(seatTypes.getAwuAllocationForNormalizedSeatType).mockReturnValue(
    8000
  );
});

describe("/api/w/[wId]/groups/[groupId]/spend_limit", () => {
  describe("auth", () => {
    it("returns 403 when caller is not an admin", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const group = await makeProvisionedGroup(workspace);
      await createPrivateApiMockRequest({
        method: "PUT",
        role: "user",
        workspace,
      });

      const response = await putLimit(workspace.sId, group.sId, {
        kind: "limited",
        awuCredits: 1500,
      });

      expect(response.status).toBe(403);
      expect((await response.json()).error.type).toBe("workspace_auth_error");
    });

  });

  describe("input validation", () => {
    it("returns 400 on out-of-bounds awuCredits", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const group = await makeProvisionedGroup(workspace);
      const { auth } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      await FeatureFlagFactory.basic(auth, "pricing_groups");

      for (const awuCredits of [-1, 1.5, 100_000_000]) {
        const response = await putLimit(workspace.sId, group.sId, {
          kind: "limited",
          awuCredits,
        });
        expect(response.status).toBe(400);
      }
    });

    it("returns 404 when the group does not exist", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const { auth } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      await FeatureFlagFactory.basic(auth, "pricing_groups");

      const response = await putLimit(workspace.sId, "nonexistent-group-id", {
        kind: "limited",
        awuCredits: 1500,
      });

      expect(response.status).toBe(404);
      expect((await response.json()).error.type).toBe("group_not_found");
    });

    it("returns 400 on a non-provisioned group", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const regularGroup = await GroupResource.makeNew({
        name: "Space group",
        workspaceId: workspace.id,
        kind: "regular",
      });
      const { auth } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      await FeatureFlagFactory.basic(auth, "pricing_groups");

      const response = await putLimit(workspace.sId, regularGroup.sId, {
        kind: "limited",
        awuCredits: 1500,
      });

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });
  });

  describe("PUT", () => {
    it("persists the cap and upserts per-seat-type alerts for limited", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const group = await makeProvisionedGroup(workspace);
      const { auth } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      await FeatureFlagFactory.basic(auth, "pricing_groups");

      const response = await putLimit(workspace.sId, group.sId, {
        kind: "limited",
        awuCredits: 25_000,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        limit: { kind: "limited", awuCredits: 25_000 },
      });
      // Threshold = 8_000 (seat allowance) + 25_000 (group cap).
      expect(
        spendLimits.upsertMetronomeGroupCapAlertForSeatType
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          metronomeCustomerId: TEST_METRONOME_CUSTOMER_ID,
          workspaceId: workspace.sId,
          groupId: group.sId,
          seatType: "pro",
          awuCredits: 33_000,
        })
      );

      // The pool-only cap is persisted on the group.
      const reloaded = await GroupResource.fetchById(auth, group.sId);
      if (reloaded.isErr()) {
        throw reloaded.error;
      }
      expect(reloaded.value.poolCapAwuCredits).toBe(25_000);
    });

    it("clears the cap and the alerts for unlimited", async () => {
      const workspace = await makeMetronomeWorkspaceWithCustomer();
      const group = await makeProvisionedGroup(workspace);
      const { auth } = await createPrivateApiMockRequest({
        method: "PUT",
        role: "admin",
        workspace,
      });
      await FeatureFlagFactory.basic(auth, "pricing_groups");
      await group.updatePoolCap(auth, 25_000);

      const response = await putLimit(workspace.sId, group.sId, {
        kind: "unlimited",
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ limit: { kind: "unlimited" } });
      expect(
        spendLimits.clearMetronomeGroupCapAlertForSeatType
      ).toHaveBeenCalled();
      expect(
        spendLimits.upsertMetronomeGroupCapAlertForSeatType
      ).not.toHaveBeenCalled();

      const reloaded = await GroupResource.fetchById(auth, group.sId);
      if (reloaded.isErr()) {
        throw reloaded.error;
      }
      expect(reloaded.value.poolCapAwuCredits).toBeNull();
    });
  });
});
