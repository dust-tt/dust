import { MIN_USERS_FOR_ANONYMITY } from "@app/lib/api/assistant/observability/anonymity";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { JobType } from "@app/types/job_type";

// Result of resolving a job-type cohort. `cohort` carries the user sIds to scope
// analytics queries by; `below_anonymity_floor` means the cohort is too small
// to surface without risking de-anonymization.
type JobTypeCohort =
  | { kind: "cohort"; userIds: string[]; userCount: number }
  | { kind: "below_anonymity_floor"; userCount: number };

// Resolves the active workspace members whose (user-scoped) `job_type` metadata
// matches `jobType`, returning their sIds only when the cohort meets the
// anonymity floor.
export async function fetchJobTypeCohort(
  auth: Authenticator,
  jobType: JobType
): Promise<JobTypeCohort> {
  const workspace = auth.getNonNullableWorkspace();

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const memberModelIds = memberships.map((membership) => membership.userId);
  if (memberModelIds.length === 0) {
    return { kind: "below_anonymity_floor", userCount: 0 };
  }

  const matchingByModelId =
    await UserResource.fetchUserScopedMetadataValuesByUserModelIds(
      "job_type",
      memberModelIds,
      { value: jobType }
    );
  const matchingModelIds = [...matchingByModelId.keys()];

  if (matchingModelIds.length < MIN_USERS_FOR_ANONYMITY) {
    return {
      kind: "below_anonymity_floor",
      userCount: matchingModelIds.length,
    };
  }

  const users = await UserResource.fetchByModelIds(matchingModelIds);
  return {
    kind: "cohort",
    userIds: users.map((user) => user.sId),
    userCount: users.length,
  };
}
