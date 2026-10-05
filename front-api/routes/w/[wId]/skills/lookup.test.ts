import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { GetSkillsResponseBody } from "@app/types/api/skills";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function lookup(workspaceId: string, skillIds: string[]) {
  return honoApp.request(`/api/w/${workspaceId}/skills/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillIds }),
  });
}

describe("POST /api/w/:wId/skills/lookup", () => {
  it("resolves only requested active references, including readable unpublished skills", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();
    const referenced = await SkillFactory.create(auth, {
      availability: "editors",
      addCurrentUserAsEditor: false,
    });
    const archived = await SkillFactory.create(auth, { status: "archived" });
    await SkillFactory.create(auth, { name: "Not requested" });

    const response = await lookup(workspace.sId, [
      referenced.sId,
      archived.sId,
      "frames",
      "unknown",
    ]);
    expect(response.status).toBe(200);
    const data: GetSkillsResponseBody = await response.json();
    expect(data.skills.map((skill) => skill.sId).sort()).toEqual(
      [referenced.sId, "frames"].sort()
    );
    expect(
      data.skills.find((skill) => skill.sId === referenced.sId)
    ).toMatchObject({
      canRead: true,
      canWrite: false,
    });
  });

  it("omits unreadable and cross-workspace skills", async () => {
    const { auth: otherAuth } = await createPrivateApiMockRequest();
    const otherSkill = await SkillFactory.create(otherAuth);
    const { workspace, auth } = await createPrivateApiMockRequest();
    const privateSpace = await SpaceFactory.regular(workspace);
    const hiddenSkill = await SkillFactory.create(auth, {
      requestedSpaceIds: [privateSpace.id],
    });

    const response = await lookup(workspace.sId, [
      hiddenSkill.sId,
      otherSkill.sId,
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skills: [] });
  });

  it("accepts an empty selection", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    const response = await lookup(workspace.sId, []);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ skills: [] });
  });
});
