import { Authenticator } from "@app/lib/auth";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupOtherBuilderSkill({
  requestUserRole,
}: {
  requestUserRole: MembershipRoleType;
}) {
  const { workspace } = await createPrivateApiMockRequest({
    role: requestUserRole,
  });

  const skillOwner = await UserFactory.basic();
  await MembershipFactory.associate(workspace, skillOwner, {
    role: "user",
  });
  const skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    skillOwner.sId,
    workspace.sId
  );
  const skill = await SkillFactory.create(skillOwnerAuth);

  return { workspace, skill };
}

function get(workspace: { sId: string }, sId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/${sId}/history`);
}

describe("GET /api/w/:wId/skills/:sId/history", () => {
  it("allows a workspace admin to view history for a skill they do not edit", async () => {
    const { workspace, skill } = await setupOtherBuilderSkill({
      requestUserRole: "admin",
    });

    const response = await get(workspace, skill.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).history).toBeDefined();
  });

  it("returns 404 for a non-admin user who cannot administrate the skill", async () => {
    const { workspace, skill } = await setupOtherBuilderSkill({
      requestUserRole: "user",
    });

    const response = await get(workspace, skill.sId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  });
});
