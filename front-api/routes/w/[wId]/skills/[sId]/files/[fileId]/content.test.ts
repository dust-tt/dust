import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function get(workspace: { sId: string }, sId: string, fileId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/skills/${sId}/files/${fileId}/content`
  );
}

describe("GET /api/w/:wId/skills/:sId/files/:fileId/content", () => {
  it("streams newly uploaded skill attachment files for the scoped skill", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const skill = await SkillFactory.create(auth);

    const file = await FileFactory.create(auth, user, {
      contentType: "text/x-python",
      fileName: "script.py",
      fileSize: 14,
      status: "ready",
      useCase: "skill_attachment",
      useCaseMetadata: { skillId: skill.sId },
    });

    const response = await get(workspace, skill.sId, file.sId);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/x-python");
  });

  it("streams historical attachment content for a readable skill", async () => {
    const {
      auth: editorAuth,
      workspace,
      user,
    } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const skill = await SkillFactory.create(editorAuth);

    const file = await FileFactory.create(editorAuth, user, {
      contentType: "text/yaml",
      fileName: "config.yaml",
      fileSize: 11,
      status: "ready",
      useCase: "skill_attachment",
    });
    const skillUpdate = {
      agentFacingDescription: skill.agentFacingDescription,
      attachedKnowledge: [],
      icon: skill.icon,
      instructions: skill.instructions,
      manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
      mcpServerViews: [],
      name: skill.name,
      requestedSpaceIds: skill.requestedSpaceIds,
      userFacingDescription: skill.userFacingDescription,
    };
    await skill.updateSkill(editorAuth, {
      ...skillUpdate,
      fileAttachments: [file],
    });
    await skill.updateSkill(editorAuth, {
      ...skillUpdate,
      fileAttachments: [],
    });

    const { auth: readerAuth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
      workspace,
    });

    expect(skill.canWrite(readerAuth)).toBe(false);

    const response = await get(workspace, skill.sId, file.sId);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/yaml");
  });

  it("returns 404 when the attached skill cannot be fetched", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const skill = await SkillFactory.create(auth, {
      manuallyRequestedSpaceIds: [],
      requestedSpaceIds: [restrictedSpace.id],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "text/yaml",
      fileName: "restricted.yaml",
      fileSize: 11,
      status: "ready",
      useCase: "skill_attachment",
      useCaseMetadata: { skillId: skill.sId },
    });

    const response = await get(workspace, skill.sId, file.sId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  it("returns 404 for non-skill attachment files", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const skill = await SkillFactory.create(auth);

    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "notes.txt",
      fileSize: 11,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: null,
    });

    const response = await get(workspace, skill.sId, file.sId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  it("returns 404 when the file belongs to another skill", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const sourceSkill = await SkillFactory.create(auth, {
      name: "Source Skill",
    });
    const requestedSkill = await SkillFactory.create(auth, {
      name: "Requested Skill",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "source-skill-only.txt",
      fileSize: 11,
      status: "ready",
      useCase: "skill_attachment",
      useCaseMetadata: { skillId: sourceSkill.sId },
    });

    const response = await get(workspace, requestedSkill.sId, file.sId);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });
});
