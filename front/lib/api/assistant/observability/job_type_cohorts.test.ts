import { MIN_USERS_FOR_ANONYMITY } from "@app/lib/api/assistant/observability/anonymity";
import { fetchJobTypeCohort } from "@app/lib/api/assistant/observability/job_type_cohorts";
import { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

async function makeMember(
  workspace: WorkspaceType,
  jobType: string | null
): Promise<UserResource> {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "user" });
  if (jobType) {
    await user.setMetadata("job_type", jobType);
  }
  return user;
}

describe("fetchJobTypeCohort", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );
  });

  it("declines when the cohort is below the anonymity floor", async () => {
    for (let i = 0; i < MIN_USERS_FOR_ANONYMITY - 1; i++) {
      await makeMember(workspace, "engineering");
    }

    const cohort = await fetchJobTypeCohort(auth, "engineering");

    expect(cohort.kind).toBe("below_anonymity_floor");
    if (cohort.kind === "below_anonymity_floor") {
      expect(cohort.userCount).toBe(MIN_USERS_FOR_ANONYMITY - 1);
    }
  });

  it("returns the cohort user sIds when the floor is met", async () => {
    const members: UserResource[] = [];
    for (let i = 0; i < MIN_USERS_FOR_ANONYMITY; i++) {
      members.push(await makeMember(workspace, "engineering"));
    }

    const cohort = await fetchJobTypeCohort(auth, "engineering");

    expect(cohort.kind).toBe("cohort");
    if (cohort.kind === "cohort") {
      expect(cohort.userCount).toBe(MIN_USERS_FOR_ANONYMITY);
      expect(new Set(cohort.userIds)).toEqual(
        new Set(members.map((m) => m.sId))
      );
    }
  });

  it("only counts members with the requested job type", async () => {
    for (let i = 0; i < MIN_USERS_FOR_ANONYMITY; i++) {
      await makeMember(workspace, "engineering");
    }
    // Different job type and no job type — must not inflate the sales cohort.
    for (let i = 0; i < MIN_USERS_FOR_ANONYMITY; i++) {
      await makeMember(workspace, "marketing");
    }
    await makeMember(workspace, null);

    const cohort = await fetchJobTypeCohort(auth, "sales");

    expect(cohort.kind).toBe("below_anonymity_floor");
    if (cohort.kind === "below_anonymity_floor") {
      expect(cohort.userCount).toBe(0);
    }
  });

  it("excludes users who have the job type but are not workspace members", async () => {
    for (let i = 0; i < MIN_USERS_FOR_ANONYMITY; i++) {
      await makeMember(workspace, "engineering");
    }
    // A user with the job type set but no membership in this workspace.
    const nonMember = await UserFactory.basic();
    await nonMember.setMetadata("job_type", "engineering");

    const cohort = await fetchJobTypeCohort(auth, "engineering");

    expect(cohort.kind).toBe("cohort");
    if (cohort.kind === "cohort") {
      expect(cohort.userCount).toBe(MIN_USERS_FOR_ANONYMITY);
      expect(cohort.userIds).not.toContain(nonMember.sId);
    }
  });
});
