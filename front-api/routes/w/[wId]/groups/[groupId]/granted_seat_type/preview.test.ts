import type {
  SeatPlanResponseBody,
  SeatTypeInfo,
} from "@app/lib/api/credits/seat_plan";
import { getSeatPlan } from "@app/lib/api/credits/seat_plan";
import type { Authenticator } from "@app/lib/auth";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import * as planType from "@app/lib/metronome/plan_type";
import * as seatTypes from "@app/lib/metronome/seat_types";
import { GroupResource } from "@app/lib/resources/group_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { MembershipSeatType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/plan_type", async (importOriginal) => ({
  ...(await importOriginal<typeof planType>()),
  getActiveContract: vi.fn(),
}));

vi.mock("@app/lib/metronome/seat_types", async (importOriginal) => ({
  ...(await importOriginal<typeof seatTypes>()),
  getProductSeatTypes: vi.fn(),
}));

vi.mock("@app/lib/api/credits/seat_plan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/api/credits/seat_plan")>()),
  getSeatPlan: vi.fn(),
}));

vi.mock("@app/lib/metronome/contracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/metronome/contracts")>()),
  getCachedMetronomeCurrentBillingPeriod: vi.fn(),
}));

async function enableFlag(auth: Authenticator) {
  await FeatureFlagFactory.basic(auth, "group_seat_provisioning");
}

// A Metronome contract that entitles and bills each listed seat type, so
// `getSeatSubscriptionsFromContract` resolves them as billed seats.
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

function seatInfo(overrides: Partial<SeatTypeInfo>): SeatTypeInfo {
  return {
    name: "Seat",
    awuCredits: 0,
    awuCreditsPeriod: "monthly",
    priceCents: 1000,
    currency: "usd",
    billingFrequency: "monthly",
    minSeats: 0,
    maxSeats: null,
    assignedCount: 0,
    currentBillingPeriod: null,
    ...overrides,
  };
}

function postPreview(
  wId: string,
  groupId: string,
  body: Record<string, unknown>
) {
  return honoApp.request(
    `/api/w/${wId}/groups/${groupId}/granted_seat_type/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
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

beforeEach(() => {
  vi.clearAllMocks();
  // Benign defaults: no active contract unless a test opts into a billed one.
  vi.mocked(planType.getActiveContract).mockResolvedValue(null);
  vi.mocked(seatTypes.getProductSeatTypes).mockResolvedValue(new Map());
  vi.mocked(getCachedMetronomeCurrentBillingPeriod).mockResolvedValue(
    new Ok({
      cycleStart: new Date("2026-09-01T00:00:00Z"),
      cycleEnd: new Date("2026-10-01T00:00:00Z"),
    })
  );
});

describe("/api/w/[wId]/groups/[groupId]/granted_seat_type/preview", () => {
  it("returns 403 when the caller is a manager (admin only)", async () => {
    const workspace = await WorkspaceFactory.basic();
    const group = await makeProvisionedGroup(workspace);
    await createPrivateApiMockRequest({
      method: "POST",
      role: "manager",
      workspace,
    });

    const response = await postPreview(workspace.sId, group.sId, {
      grantedSeatType: "pro",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("returns 403 when the feature flag is disabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    const group = await makeProvisionedGroup(workspace);
    await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });

    const response = await postPreview(workspace.sId, group.sId, {
      grantedSeatType: "pro",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("returns 400 on a seat type that is not group-grantable", async () => {
    const workspace = await WorkspaceFactory.basic();
    const group = await makeProvisionedGroup(workspace);
    await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });

    const response = await postPreview(workspace.sId, group.sId, {
      grantedSeatType: "free",
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 when the group belongs to another workspace", async () => {
    const workspace = await WorkspaceFactory.basic();
    const otherWorkspace = await WorkspaceFactory.basic();
    const otherGroup = await makeProvisionedGroup(otherWorkspace);
    const { auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });
    await enableFlag(auth);

    const response = await postPreview(workspace.sId, otherGroup.sId, {
      grantedSeatType: "pro",
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("group_not_found");
  });

  it("returns 400 when the workspace contract does not bill the seat tier", async () => {
    // A non-Metronome workspace bills no seats, so the tier can't be resolved.
    const workspace = await WorkspaceFactory.basic();
    const group = await makeProvisionedGroup(workspace);
    const { auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });
    await enableFlag(auth);

    const response = await postPreview(workspace.sId, group.sId, {
      grantedSeatType: "pro",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("previews the cost and members that would move to a billed seat", async () => {
    const workspace = await WorkspaceFactory.creditPriced();
    const { auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
      workspace,
    });
    const group = await makeProvisionedGroup(workspace);

    // A member with no seat who would move to Pro. Added before enabling the
    // flag so the after-commit seat sync is a no-op and leaves them on `none`.
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, {
      role: "user",
      seatType: "none",
    });
    await GroupFactory.withMembers(auth, group, [user]);
    await enableFlag(auth);

    setupEntitledSeats(["pro"]);
    const seatPlans: SeatPlanResponseBody = {
      pro: seatInfo({ name: "Pro", awuCredits: 100, priceCents: 2000 }),
    };
    vi.mocked(getSeatPlan).mockResolvedValue(new Ok(seatPlans));

    const response = await postPreview(workspace.sId, group.sId, {
      grantedSeatType: "pro",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preview.targetSeatType).toBe("pro");
    expect(body.preview.memberCount).toBe(1);
  });
});
