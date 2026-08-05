import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { PodRestrictionImpactType } from "@app/types/api/projects/restriction_impact";
import { POD_RESTRICTION_IMPACT_WINDOW_DAYS } from "@app/types/api/projects/restriction_impact";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const EMPTY_IMPACT: PodRestrictionImpactType = {
  brokenInvocationCount: 0,
  brokenUserCount: 0,
  totalInvocationCount: 0,
  nonHumanInvocationCount: 0,
};

/**
 * Estimates how much Pod function usage would break if `pod` were restricted.
 *
 * An open Pod carries the workspace global group, which is what lets non-members read its space
 * and therefore invoke its functions. Restricting the Pod drops that group, so anyone who is
 * neither a Pod member nor a workspace admin loses access — and any Frame they were driving stops
 * working. This counts the recent invocations that would be lost.
 *
 * Retrospective by nature: it measures who did invoke in the window, not who would. A caller on a
 * quarterly cadence reports as zero, so the result is an estimate rather than a guarantee.
 */
export async function getPodRestrictionImpact(
  auth: Authenticator,
  pod: SpaceResource
): Promise<PodRestrictionImpactType> {
  const sandboxFunctions = await SandboxFunctionResource.listBySpace(auth, pod);
  if (sandboxFunctions.length === 0) {
    return EMPTY_IMPACT;
  }

  const since = new Date(
    Date.now() - POD_RESTRICTION_IMPACT_WINDOW_DAYS * MS_PER_DAY
  );
  const countsByUserModelId =
    await SandboxFunctionInvocationResource.countByUserSince(auth, {
      sandboxFunctionIds: sandboxFunctions.map(
        (sandboxFunction) => sandboxFunction.id
      ),
      since,
    });

  // Who still reaches the Pod once the global group is gone: its own member and editor groups.
  const podMembers = await pod.fetchDistinctActiveManualGroupMembers(auth);
  const retainsAccess = new Set(podMembers.map((member) => member.id));

  // Workspace admins administrate every space, so restricting the Pod does not lock them out.
  // Function reads go through `canReadOrAdministrate`, which is what makes this true.
  const { memberships: adminMemberships } =
    await MembershipResource.getActiveMemberships({
      workspace: auth.getNonNullableWorkspace(),
      roles: ["admin"],
    });
  for (const membership of adminMemberships) {
    retainsAccess.add(membership.userId);
  }

  let brokenInvocationCount = 0;
  let brokenUserCount = 0;
  let totalInvocationCount = 0;
  let nonHumanInvocationCount = 0;

  for (const [userModelId, count] of countsByUserModelId) {
    totalInvocationCount += count;

    if (userModelId === null) {
      nonHumanInvocationCount += count;
      continue;
    }

    if (!retainsAccess.has(userModelId)) {
      brokenInvocationCount += count;
      brokenUserCount += 1;
    }
  }

  return {
    brokenInvocationCount,
    brokenUserCount,
    totalInvocationCount,
    nonHumanInvocationCount,
  };
}
