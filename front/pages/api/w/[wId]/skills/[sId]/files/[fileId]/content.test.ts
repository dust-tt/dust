import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { describe, expect, it } from "vitest";

import handler from "./content";

describe("GET /api/w/[wId]/skills/[sId]/files/[fileId]/content", () => {
  it("streams newly uploaded skill attachment files for the scoped skill", async () => {
    const { auth, req, res, user } = await createPrivateApiMockRequest({
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

    req.query = {
      ...req.query,
      sId: skill.sId,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader("Content-Type")).toBe("text/x-python");
  });

  it("streams skill attachment content for a readable skill", async () => {
    const { auth, req, res, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const skill = await SkillFactory.create(auth, {
      addCurrentUserAsEditor: false,
    });

    expect(skill.canWrite(auth)).toBe(false);

    const file = await FileFactory.create(auth, user, {
      contentType: "text/yaml",
      fileName: "config.yaml",
      fileSize: 11,
      status: "ready",
      useCase: "skill_attachment",
      useCaseMetadata: { skillId: skill.sId },
    });

    req.query = {
      ...req.query,
      sId: skill.sId,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader("Content-Type")).toBe("text/yaml");
  });

  it("returns 404 when the attached skill cannot be fetched", async () => {
    const { auth, req, res, user, workspace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const skill = await SkillFactory.create(auth, {
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

    req.query = {
      ...req.query,
      sId: skill.sId,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("returns 404 for non-skill attachment files", async () => {
    const { auth, req, res, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "builder",
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

    req.query = {
      ...req.query,
      sId: skill.sId,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("returns 404 when the file belongs to another skill", async () => {
    const { auth, req, res, user } = await createPrivateApiMockRequest({
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

    req.query = {
      ...req.query,
      sId: requestedSkill.sId,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });
});
