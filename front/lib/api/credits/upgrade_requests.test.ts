import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { createUpgradeRequest } from "@app/lib/api/credits/upgrade_requests";
import * as workspaceApi from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import type * as upgradeRequestNotif from "@app/lib/notifications/workflows/upgrade-request-created";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { MembershipUpgradeRequestResource } from "@app/lib/resources/membership_upgrade_request_resource";
import { MembershipUpgradeRequestModel } from "@app/lib/resources/storage/models/membership_upgrade_requests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { UniqueConstraintError } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return { ...actual, emitAuditLogEvent: vi.fn() };
});

vi.mock("@app/lib/api/workspace", async () => {
  const actual = await vi.importActual<typeof workspaceApi>(
    "@app/lib/api/workspace"
  );
  return { ...actual, getMembers: vi.fn() };
});

vi.mock(
  "@app/lib/notifications/workflows/upgrade-request-created",
  async () => {
    const actual = await vi.importActual<typeof upgradeRequestNotif>(
      "@app/lib/notifications/workflows/upgrade-request-created"
    );
    return { ...actual, notifyUpgradeRequested: vi.fn() };
  }
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(workspaceApi.getMembers).mockResolvedValue({
    members: [],
    total: 0,
  });
  vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
});

async function setup({
  requireUpgradeRequestReason,
}: {
  requireUpgradeRequestReason: boolean;
}) {
  const workspace = await WorkspaceFactory.creditPriced();
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "user" });

  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  await CreditUsageConfigurationResource.makeNew(adminAuth, {
    allowMemberUpgradeRequests: true,
    upgradeRequestEmailEnabled: false,
    requireUpgradeRequestReason,
    defaultDiscountPercent: 0,
    usageCapCredits: null,
  });

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  return { auth };
}

describe("createUpgradeRequest", () => {
  it("rejects a missing reason when none is pending and a reason is required", async () => {
    const { auth } = await setup({ requireUpgradeRequestReason: true });

    const result = await createUpgradeRequest(auth, { reason: null });

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      throw new Error("expected Err result");
    }
    expect(result.error.type).toBe("reason_required");
  });

  it("returns the existing pending request on retry with a missing reason, even once a reason becomes required", async () => {
    const { auth } = await setup({ requireUpgradeRequestReason: false });

    const initial = await createUpgradeRequest(auth, {
      reason: "Need more credits",
    });
    expect(initial.isOk()).toBe(true);
    if (!initial.isOk()) {
      throw new Error("expected Ok result");
    }

    // Simulate the workspace toggling the reason requirement on after the
    // first request already succeeded.
    const config =
      await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
    if (!config) {
      throw new Error("expected configuration to exist");
    }
    await config.updateConfiguration(auth, {
      requireUpgradeRequestReason: true,
    });

    // A retry (e.g. a network retry from an older client) with no reason
    // must reuse the existing pending request rather than being rejected.
    const retry = await createUpgradeRequest(auth, { reason: null });

    expect(retry.isOk()).toBe(true);
    if (!retry.isOk()) {
      throw new Error("expected Ok result");
    }
    expect(retry.value.sId).toBe(initial.value.sId);
  });

  it("reuses the winning request when it loses the race on the pending unique index", async () => {
    const { auth } = await setup({ requireUpgradeRequestReason: false });
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    // Simulate another request that already committed its pending row
    // between this request's `findOne` and `create`.
    const winner = await MembershipUpgradeRequestModel.create({
      workspaceId: workspace.id,
      userId: user.id,
      status: "pending",
      reason: "Winning request",
    });

    vi.spyOn(MembershipUpgradeRequestModel, "findOne").mockResolvedValueOnce(
      null
    );
    vi.spyOn(MembershipUpgradeRequestModel, "create").mockImplementationOnce(
      async () => {
        throw new UniqueConstraintError({});
      }
    );

    const result = await createUpgradeRequest(auth, {
      reason: "Losing request",
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      throw new Error("expected Ok result");
    }
    expect(result.value.sId).toBe(
      MembershipUpgradeRequestResource.modelIdToSId({
        id: winner.id,
        workspaceId: workspace.id,
      })
    );
  });
});
