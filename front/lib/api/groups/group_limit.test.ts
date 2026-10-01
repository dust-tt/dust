import * as workosAudit from "@app/lib/api/audit/workos_audit";
import {
  MAX_GROUP_LIMIT_AWU_CREDITS,
  setGroupLimit,
} from "@app/lib/api/groups/group_limit";
import { areGroupLimitsEnabled } from "@app/lib/api/groups/group_limit_eligibility";
import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { GroupLimit } from "@app/types/api/groups/group_limit";
import { UniqueConstraintError } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/groups/group_limit_eligibility", () => ({
  areGroupLimitsEnabled: vi.fn(),
}));

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return { ...actual, emitAuditLogEvent: vi.fn() };
});

const AUDIT_CONTEXT = { location: "127.0.0.1" };

beforeEach(() => {
  vi.mocked(areGroupLimitsEnabled).mockResolvedValue(true);
  vi.mocked(workosAudit.emitAuditLogEvent).mockResolvedValue(undefined);
});

async function setLimit(
  auth: Authenticator,
  group: GroupResource,
  limit: GroupLimit
) {
  return setGroupLimit(auth, {
    groupId: group.sId,
    limit,
    auditContext: AUDIT_CONTEXT,
  });
}

async function reload(auth: Authenticator, group: GroupResource) {
  const res = await GroupResource.fetchById(auth, group.sId);
  if (res.isErr()) {
    throw res.error;
  }
  return {
    groupLimitAwuCredits: res.value.groupLimitAwuCredits,
    groupLimitPriority: res.value.groupLimitPriority,
  };
}

async function setup() {
  const workspace = await WorkspaceFactory.creditPriced();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return { workspace, auth };
}

describe("setGroupLimit", () => {
  describe("priority", () => {
    it("assigns priorities in the order limits are first set", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const sales = await GroupFactory.regularManual(workspace, "Sales");

      expect(
        (
          await setLimit(auth, engineering, {
            kind: "limited",
            awuCredits: 10_000,
          })
        ).isOk()
      ).toBe(true);
      expect(
        (
          await setLimit(auth, sales, { kind: "limited", awuCredits: 6_000 })
        ).isOk()
      ).toBe(true);

      expect(await reload(auth, engineering)).toEqual({
        groupLimitAwuCredits: 10_000,
        groupLimitPriority: 1,
      });
      expect(await reload(auth, sales)).toEqual({
        groupLimitAwuCredits: 6_000,
        groupLimitPriority: 2,
      });
    });

    it("keeps the priority when the amount changes", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const sales = await GroupFactory.regularManual(workspace, "Sales");
      await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 10_000,
      });
      await setLimit(auth, sales, { kind: "limited", awuCredits: 6_000 });

      await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 15_000,
      });

      expect(await reload(auth, engineering)).toEqual({
        groupLimitAwuCredits: 15_000,
        groupLimitPriority: 1,
      });
    });

    it("clears both columns when the limit is removed", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 10_000,
      });

      const result = await setLimit(auth, engineering, { kind: "unlimited" });

      expect(result.isOk()).toBe(true);
      expect(await reload(auth, engineering)).toEqual({
        groupLimitAwuCredits: null,
        groupLimitPriority: null,
      });
    });

    it("appends a group after the others when its limit is set again", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const sales = await GroupFactory.regularManual(workspace, "Sales");
      await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 10_000,
      });
      await setLimit(auth, sales, { kind: "limited", awuCredits: 6_000 });
      await setLimit(auth, engineering, { kind: "unlimited" });

      await setLimit(auth, engineering, { kind: "limited", awuCredits: 1_000 });

      expect((await reload(auth, engineering)).groupLimitPriority).toBe(3);
      expect((await reload(auth, sales)).groupLimitPriority).toBe(2);
    });

    it("assigns a priority to a limited group that has none", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const sales = await GroupFactory.regularManual(workspace, "Sales");
      await setLimit(auth, sales, { kind: "limited", awuCredits: 6_000 });
      await GroupFactory.withRawGroupLimit(engineering, {
        groupLimitAwuCredits: 10_000,
        groupLimitPriority: null,
      });

      await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 10_000,
      });

      expect(await reload(auth, engineering)).toEqual({
        groupLimitAwuCredits: 10_000,
        groupLimitPriority: 2,
      });
    });

    it("rejects a write that would reuse a taken priority", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const sales = await GroupFactory.regularManual(workspace, "Sales");
      await setLimit(auth, sales, { kind: "limited", awuCredits: 6_000 });
      // Simulates a concurrent first set that read the max before Sales got priority 1.
      vi.spyOn(GroupModel, "max").mockResolvedValueOnce(null);

      await expect(
        setLimit(auth, engineering, { kind: "limited", awuCredits: 10_000 })
      ).rejects.toBeInstanceOf(UniqueConstraintError);
    });
  });

  describe("validation and permissions", () => {
    it("refuses a group kind that cannot carry a group limit", async () => {
      const { auth } = await setup();
      const globalGroupRes =
        await GroupResource.fetchWorkspaceGlobalGroup(auth);
      if (globalGroupRes.isErr()) {
        throw globalGroupRes.error;
      }

      const result = await setLimit(auth, globalGroupRes.value, {
        kind: "limited",
        awuCredits: 1_000,
      });

      expect(result.isErr() && result.error.type).toBe("invalid_group_kind");
    });

    it("refuses non-admins, including members with usage-limit rights", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      const member = await UserFactory.basic();
      await MembershipFactory.associate(workspace, member, { role: "user" });
      const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        member.sId,
        workspace.sId
      );

      const result = await setLimit(memberAuth, engineering, {
        kind: "limited",
        awuCredits: 1_000,
      });

      expect(result.isErr() && result.error.type).toBe("unauthorized");
      expect((await reload(auth, engineering)).groupLimitAwuCredits).toBeNull();
    });

    it("refuses when group limits are not enabled for the workspace", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );
      vi.mocked(areGroupLimitsEnabled).mockResolvedValue(false);

      const result = await setLimit(auth, engineering, {
        kind: "limited",
        awuCredits: 1_000,
      });

      expect(result.isErr() && result.error.type).toBe(
        "group_limits_not_enabled"
      );
      expect((await reload(auth, engineering)).groupLimitAwuCredits).toBeNull();
    });

    it("refuses amounts outside the allowed range", async () => {
      const { workspace, auth } = await setup();
      const engineering = await GroupFactory.regularManual(
        workspace,
        "Engineering"
      );

      for (const awuCredits of [-1, 1.5, MAX_GROUP_LIMIT_AWU_CREDITS + 1]) {
        const result = await setLimit(auth, engineering, {
          kind: "limited",
          awuCredits,
        });
        expect(result.isErr() && result.error.type).toBe("invalid_threshold");
      }
      expect((await reload(auth, engineering)).groupLimitAwuCredits).toBeNull();
    });
  });

  it("emits a group.group_limit_updated audit event", async () => {
    const { workspace, auth } = await setup();
    const engineering = await GroupFactory.regularManual(
      workspace,
      "Engineering"
    );
    await setLimit(auth, engineering, { kind: "limited", awuCredits: 10_000 });

    await setLimit(auth, engineering, { kind: "limited", awuCredits: 12_000 });

    expect(workosAudit.emitAuditLogEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "group.group_limit_updated",
        metadata: {
          kind: "limited",
          awu_credits: "12000",
          previous_kind: "limited",
          previous_awu_credits: "10000",
        },
      })
    );
  });
});
