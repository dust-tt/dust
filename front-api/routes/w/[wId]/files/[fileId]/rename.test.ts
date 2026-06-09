import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function renameUrl(workspace: { sId: string }, fileId: string) {
  return `/api/w/${workspace.sId}/files/${fileId}/rename`;
}

function patchRename(
  workspace: { sId: string },
  fileId: string,
  body: unknown
) {
  return honoApp.request(renameUrl(workspace, fileId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/w/:wId/files/:fileId/rename", () => {
  it("should return 404 when file does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });

    const response = await patchRename(workspace, "non-existent-file", {
      fileName: "new-name.txt",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 400 when fileName is missing", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "builder",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    const response = await patchRename(workspace, file.sId, {});

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("should return 400 when fileName is empty", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "builder",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    const response = await patchRename(workspace, file.sId, {
      fileName: "   ",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("should allow builder to rename any file", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "builder",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "old-name.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    const response = await patchRename(workspace, file.sId, {
      fileName: "new-name.pdf",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).file.fileName).toBe("new-name.pdf");
  });

  it("should deny non-builder from renaming non-project files", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    const response = await patchRename(workspace, file.sId, {
      fileName: "new-name.pdf",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `builders` for the current workspace can modify files.",
      },
    });
  });

  describe("project_context files", () => {
    it("should allow user with space write access to rename project files", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "user",
      });

      const projectSpace = await SpaceFactory.project(workspace, user.id);

      const file = await FileFactory.create(auth, user, {
        contentType: "application/pdf",
        fileName: "old-name.pdf",
        fileSize: 1024,
        status: "ready",
        useCase: "project_context",
        useCaseMetadata: {
          spaceId: projectSpace.sId,
        },
      });

      const response = await patchRename(workspace, file.sId, {
        fileName: "new-name.pdf",
      });

      expect(response.status).toBe(200);
      expect((await response.json()).file.fileName).toBe("new-name.pdf");
    });

    it("should deny user without space write access from renaming project files", async () => {
      const { auth, user, workspace } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "user",
      });

      const space = await SpaceFactory.regular(workspace);

      const file = await FileFactory.create(auth, user, {
        contentType: "application/pdf",
        fileName: "test.pdf",
        fileSize: 1024,
        status: "ready",
        useCase: "project_context",
        useCaseMetadata: {
          spaceId: space.sId,
        },
      });

      const response = await patchRename(workspace, file.sId, {
        fileName: "new-name.pdf",
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          type: "workspace_auth_error",
          message: "You cannot edit files in that space.",
        },
      });
    });
  });

  it("should trim whitespace from fileName", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "builder",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "old-name.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    const response = await patchRename(workspace, file.sId, {
      fileName: "  new-name.pdf  ",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).file.fileName).toBe("new-name.pdf");
  });
});
