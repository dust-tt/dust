import { Authenticator } from "@app/lib/auth";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getSkills(
  workspace: { sId: string },
  key: { secret: string },
  query?: Record<string, string>
) {
  const params = query ? `?${new URLSearchParams(query).toString()}` : "";
  return honoApp.request(`/api/v1/w/${workspace.sId}/skills${params}`, {
    headers: { authorization: `Bearer ${key.secret}` },
  });
}

describe("GET /api/v1/w/[wId]/skills", () => {
  it("returns active skills by default", async () => {
    const { workspace, key } = await createPublicApiMockRequest();
    const user = await UserFactory.basic();
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );

    await SkillFactory.create(auth, {
      name: "Active API Skill",
      instructions: "Test skill instructions",
    });
    await SkillFactory.create(auth, {
      name: "Archived API Skill",
      status: "archived",
      instructions: "Test skill instructions",
    });

    const response = await getSkills(workspace, key);

    expect(response.status).toBe(200);
    const data = await response.json();
    const skillNames = data.skills.map((skill: { name: string }) => skill.name);

    expect(skillNames).toContain("Active API Skill");
    expect(skillNames).not.toContain("Archived API Skill");
  });

  it("returns skills matching the requested status", async () => {
    const { workspace, key } = await createPublicApiMockRequest();
    const user = await UserFactory.basic();
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );

    await SkillFactory.create(auth, {
      name: "Active API Skill",
      instructions: "Test skill instructions",
    });
    await SkillFactory.create(auth, {
      name: "Archived API Skill",
      status: "archived",
      instructions: "Test skill instructions",
    });

    const response = await getSkills(workspace, key, { status: "archived" });

    expect(response.status).toBe(200);
    const data = await response.json();
    const skillNames = data.skills.map((skill: { name: string }) => skill.name);

    expect(skillNames).toContain("Archived API Skill");
    expect(skillNames).not.toContain("Active API Skill");
  });
});
