import {
  getWorkspacePlanLimitOverrides,
  setWorkspacePlanLimitOverrides,
} from "@app/lib/api/plan_limit_overrides";
import { evaluateWorkspaceSeatAvailability } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import type { PlanLimitOverride } from "@app/lib/plans/plan_limit_overrides";
import { EMPTY_PLAN_LIMIT_OVERRIDE } from "@app/lib/plans/plan_limit_overrides";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { PlanFactory } from "@app/tests/utils/PlanFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

function override(partial: Partial<PlanLimitOverride>): PlanLimitOverride {
  return { ...EMPTY_PLAN_LIMIT_OVERRIDE, ...partial };
}

// The plan the workspace is subscribed to, so tests can assert against the
// values the override replaces.
const PLAN_MAX_USERS = 4;
const PLAN_MAX_FREE_USERS = 2;
const PLAN_MAX_LIFETIME_FREE_USERS = 3;

describe("workspace plan limit overrides", () => {
  let workspace: LightWorkspaceType;
  let auth: Authenticator;

  beforeEach(async () => {
    const plan = await PlanFactory.enterprise("ENT_PLAN_LIMIT_OVERRIDE_TEST", {
      maxUsersInWorkspace: PLAN_MAX_USERS,
      maxFreeUsersInWorkspace: PLAN_MAX_FREE_USERS,
      maxLifetimeFreeUsersInWorkspace: PLAN_MAX_LIFETIME_FREE_USERS,
    });
    workspace = await WorkspaceFactory.fromPlan(plan);
    auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  async function activeSubscription() {
    const subscription =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
    return subscription.toJSON();
  }

  async function effectiveUserLimits() {
    return (await activeSubscription()).plan.limits.users;
  }

  it("uses the plan values when the workspace has no override", async () => {
    expect(await getWorkspacePlanLimitOverrides(auth)).toBeNull();

    const limits = await effectiveUserLimits();
    expect(limits.maxUsers).toBe(PLAN_MAX_USERS);
    expect(limits.maxFreeUsers).toBe(PLAN_MAX_FREE_USERS);
    expect(limits.maxLifetimeFreeUsers).toBe(PLAN_MAX_LIFETIME_FREE_USERS);
  });

  it("applies the override to the effective plan limits", async () => {
    const res = await setWorkspacePlanLimitOverrides(
      auth,
      override({ maxUsersInWorkspace: 500, maxFreeUsersInWorkspace: -1 })
    );
    expect(res.isOk()).toBe(true);

    const limits = await effectiveUserLimits();
    expect(limits.maxUsers).toBe(500);
    expect(limits.maxFreeUsers).toBe(-1);
    // Not overridden: still the plan value.
    expect(limits.maxLifetimeFreeUsers).toBe(PLAN_MAX_LIFETIME_FREE_USERS);
  });

  it("clears the override and falls back to the plan values", async () => {
    await setWorkspacePlanLimitOverrides(
      auth,
      override({ maxUsersInWorkspace: 500 })
    );
    expect(await getWorkspacePlanLimitOverrides(auth)).not.toBeNull();

    await setWorkspacePlanLimitOverrides(auth, EMPTY_PLAN_LIMIT_OVERRIDE);

    expect(await getWorkspacePlanLimitOverrides(auth)).toBeNull();
    expect((await effectiveUserLimits()).maxUsers).toBe(PLAN_MAX_USERS);
  });

  it("rejects a limit below -1 and writes nothing", async () => {
    const res = await setWorkspacePlanLimitOverrides(
      auth,
      override({ maxUsersInWorkspace: -2 })
    );

    expect(res.isErr()).toBe(true);
    expect(await getWorkspacePlanLimitOverrides(auth)).toBeNull();
  });

  it("rejects a non-integer limit", async () => {
    const res = await setWorkspacePlanLimitOverrides(
      auth,
      override({ maxFreeUsersInWorkspace: 2.5 })
    );

    expect(res.isErr()).toBe(true);
    expect(await getWorkspacePlanLimitOverrides(auth)).toBeNull();
  });

  it("does not clobber an existing override when the new value is invalid", async () => {
    await setWorkspacePlanLimitOverrides(
      auth,
      override({ maxUsersInWorkspace: 500 })
    );

    const res = await setWorkspacePlanLimitOverrides(
      auth,
      override({ maxUsersInWorkspace: -2 })
    );

    expect(res.isErr()).toBe(true);
    expect((await effectiveUserLimits()).maxUsers).toBe(500);
  });

  it("is honored by the workspace seat-availability check", async () => {
    // The workspace has no member yet, so it is under the plan cap.
    expect(
      await evaluateWorkspaceSeatAvailability(
        workspace,
        await activeSubscription()
      )
    ).toBe(true);

    await setWorkspacePlanLimitOverrides(
      auth,
      override({ maxUsersInWorkspace: 0 })
    );

    expect(
      await evaluateWorkspaceSeatAvailability(
        workspace,
        await activeSubscription()
      )
    ).toBe(false);
  });
});
