import type { Authenticator } from "@app/lib/auth";
import type { PlanLimitOverride } from "@app/lib/plans/plan_limit_overrides";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspacePlanLimitOverrideResource } from "@app/lib/resources/workspace_plan_limit_override_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Returns the plan-limit overrides configured for the workspace, or `null` when
 * it has none.
 */
export async function getWorkspacePlanLimitOverrides(
  auth: Authenticator
): Promise<PlanLimitOverride | null> {
  return WorkspacePlanLimitOverrideResource.fetchByWorkspace({
    workspace: auth.getNonNullableWorkspace(),
  });
}

/**
 * Sets the plan-limit overrides for the workspace. Fields passed as `null` are
 * cleared, so the workspace falls back to its plan value.
 *
 * This is the only entry point that should be used to write overrides: the
 * rendered plan (and therefore the effective limits) is part of the Redis-cached
 * subscription, so the cache must be invalidated for the change to take effect.
 */
export async function setWorkspacePlanLimitOverrides(
  auth: Authenticator,
  override: PlanLimitOverride
): Promise<Result<undefined, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const res = await WorkspacePlanLimitOverrideResource.upsert({
    workspace,
    override,
  });
  if (res.isErr()) {
    return res;
  }

  await SubscriptionResource.invalidateSubscriptionCache(workspace.id);

  logger.info(
    { workspaceId: workspace.sId, override },
    "[PlanLimitOverrides] Updated workspace plan limit overrides"
  );

  return new Ok(undefined);
}
