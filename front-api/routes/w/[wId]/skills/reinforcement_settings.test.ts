import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { ENSURE_IS_ADMIN_ERROR_MESSAGE } from "@front-api/middlewares/ensure_role";
import { describe, expect, it } from "vitest";

function get(workspace: { sId: string }) {
  return honoApp.request(
    `/api/w/${workspace.sId}/skills/reinforcement_settings`
  );
}

describe("GET /api/w/:wId/skills/reinforcement_settings", () => {
  it("returns compact settings and editor avatars for active custom skills", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const skill = await SkillFactory.create(auth, {
      name: "Improving skill",
      addCurrentUserAsEditor: true,
    });
    await skill.updateReinforcement("off");
    await skill.updateSelfImprovementLock(true);
    await skill.updateSelfImprovementCostsCap(2_000_000);
    await skill.updateSelfImprovementCostsCapAwuCredits(100);
    await SkillFactory.create(auth, { status: "archived" });
    await SkillFactory.create(auth, { status: "suggested" });
    const { authenticator: otherAuth } = await createResourceTest({});
    await SkillFactory.create(otherAuth, { name: "Other workspace skill" });

    const response = await get(workspace);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      skills: [
        {
          sId: skill.sId,
          name: skill.name,
          icon: skill.icon,
          isDustProvided: false,
          reinforcement: "off",
          selfImprovementLock: true,
          selfImprovementCostsCapMicroUsd: 2_000_000,
          selfImprovementCostsCapAwuCredits: 100,
          editors: [
            {
              sId: auth.getNonNullableUser().sId,
              fullName: auth.getNonNullableUser().fullName(),
              image: auth.getNonNullableUser().imageUrl,
            },
          ],
        },
      ],
    });
  });

  it("preserves space and unpublished skill visibility", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const published = await SkillFactory.create(auth, { name: "Published" });
    const ownDraft = await SkillFactory.create(auth, {
      name: "Own draft",
      availability: "editors",
      addCurrentUserAsEditor: true,
    });
    const otherDraft = await SkillFactory.create(auth, {
      name: "Other draft",
      availability: "editors",
      addCurrentUserAsEditor: false,
    });
    expect(auth.can("read", otherDraft)).toBe(true);
    expect(auth.can("write", otherDraft)).toBe(false);
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await SkillFactory.create(auth, {
      name: "Restricted",
      requestedSpaceIds: [restrictedSpace.id],
    });

    const response = await get(workspace);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.skills.map((skill: { sId: string }) => skill.sId).sort()
    ).toEqual([published.sId, ownDraft.sId].sort());
  });

  it("returns an empty list when no custom skills are active", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await get(workspace);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skills: [] });
  });

  it("rejects non-admin users", async () => {
    for (const role of ["user", "manager"] as const) {
      const { workspace } = await createPrivateApiMockRequest({ role });

      const response = await get(workspace);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          type: "workspace_auth_error",
          message: ENSURE_IS_ADMIN_ERROR_MESSAGE,
        },
      });
    }
  });
});
