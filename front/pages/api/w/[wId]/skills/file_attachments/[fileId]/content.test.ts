import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { PassThrough } from "stream";
import { describe, expect, it, vi } from "vitest";

import handler from "./content";

function mockFileStream() {
  const readStream = Object.assign(new PassThrough(), {
    pipe: vi.fn(),
  });
  const getReadStreamSpy = vi
    .spyOn(FileResource.prototype, "getReadStream")
    .mockReturnValue(readStream);

  return { getReadStreamSpy, pipeSpy: readStream.pipe };
}

describe("GET /api/w/[wId]/skills/file_attachments/[fileId]/content", () => {
  it("streams newly uploaded skill attachment files before the skill is saved", async () => {
    const { auth, req, res, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const { getReadStreamSpy, pipeSpy } = mockFileStream();

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
    expect(res.getHeader("Content-Type")).toBe("text/x-python");
    expect(pipeSpy).toHaveBeenCalledWith(res);

    getReadStreamSpy.mockRestore();
  });

  it("streams skill attachment content for a skill editor", async () => {
    const { auth, req, res, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const skill = await SkillFactory.create(auth);
    const { getReadStreamSpy, pipeSpy } = mockFileStream();

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
    expect(res.getHeader("Content-Type")).toBe("text/yaml");
    expect(pipeSpy).toHaveBeenCalledWith(res);

    getReadStreamSpy.mockRestore();
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
