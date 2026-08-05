import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { handleMembershipInvite } from "@app/lib/api/signup";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import * as planType from "@app/lib/metronome/plan_type";
import * as seatTypes from "@app/lib/metronome/seat_types";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { MembershipInvitationFactory } from "@app/tests/utils/MembershipInvitationFactory";
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
  setupEntitledSeats(["free", "pro"]);
});

describe("handleMembershipInvite", () => {
  it("downgrades a builder invitation to a user membership", async () => {
    const workspace = await WorkspaceFactory.creditPricedFree();
    const user = await UserFactory.basic();
    await MembershipInvitationFactory.create(workspace, {
      inviteEmail: user.email,
      initialRole: "builder",
    });
    // Re-fetch so the invitation carries its workspace association.
    const membershipInvite =
      await MembershipInvitationResource.getPendingForEmailAndWorkspace({
        email: user.email,
        workspace: renderLightWorkspaceType({ workspace }),
      });
    expect(membershipInvite).not.toBeNull();

    const result = await handleMembershipInvite({
      user,
      membershipInvite: membershipInvite!,
    });

    expect(result.isOk()).toBe(true);

    const membership =
      await MembershipResource.getLatestMembershipOfUserInWorkspace({
        user,
        workspace: renderLightWorkspaceType({ workspace }),
      });
    expect(membership?.role).toBe("user");
  });

  it("preserves a non-builder invitation role", async () => {
    const workspace = await WorkspaceFactory.creditPricedFree();
    const user = await UserFactory.basic();
    await MembershipInvitationFactory.create(workspace, {
      inviteEmail: user.email,
      initialRole: "admin",
    });
    // Re-fetch so the invitation carries its workspace association.
    const membershipInvite =
      await MembershipInvitationResource.getPendingForEmailAndWorkspace({
        email: user.email,
        workspace: renderLightWorkspaceType({ workspace }),
      });
    expect(membershipInvite).not.toBeNull();

    const result = await handleMembershipInvite({
      user,
      membershipInvite: membershipInvite!,
    });

    expect(result.isOk()).toBe(true);

    const membership =
      await MembershipResource.getLatestMembershipOfUserInWorkspace({
        user,
        workspace: renderLightWorkspaceType({ workspace }),
      });
    expect(membership?.role).toBe("admin");
  });
});
