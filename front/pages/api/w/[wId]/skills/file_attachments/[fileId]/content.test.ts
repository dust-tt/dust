import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { Readable } from "stream";
import { describe, expect, it, vi } from "vitest";

import handler from "./content";

function mockFileContent(content: string) {
  return vi
    .spyOn(FileResource.prototype, "getReadStream")
    .mockReturnValue(Readable.from([content]));
}

describe("GET /api/w/[wId]/skills/file_attachments/[fileId]/content", () => {
  it("allows builders to preview newly uploaded skill attachment files before the skill is saved", async () => {
    const { auth, req, res, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "builder",
    });
    const getReadStreamSpy = mockFileContent("print('hello')");

    const file = await FileFactory.create(auth, user, {
      contentType: "text/x-python",
      fileName: "script.py",
      fileSize: 14,
      status: "ready",
      useCase: "skill_attachment",
      useCaseMetadata: null,
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ content: "print('hello')" });

    getReadStreamSpy.mockRestore();
  });

  it("returns skill attachment content for a skill editor", async () => {
    const { auth, req, res, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const skill = await SkillFactory.create(auth);
    const getReadStreamSpy = mockFileContent("name: value");

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
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ content: "name: value" });

    getReadStreamSpy.mockRestore();
  });

  it("rejects unattached skill attachments for non-builders", async () => {
    const { auth, req, res, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "text/x-python",
      fileName: "script.py",
      fileSize: 14,
      status: "ready",
      useCase: "skill_attachment",
      useCaseMetadata: null,
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "app_auth_error",
        message: "Only builders can preview unattached skill files.",
      },
    });
  });

  it("returns 404 for non-skill attachment files", async () => {
    const { auth, req, res, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "builder",
    });

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
