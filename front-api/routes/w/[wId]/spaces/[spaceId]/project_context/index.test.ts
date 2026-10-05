import { FileResource } from "@app/lib/resources/file_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { ProjectFileFactory } from "@app/tests/utils/ProjectFileFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { frameV2ContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DELETE /api/w/:wId/spaces/:spaceId/project_context/files/:fileId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes the file from project context and returns 200", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });

    const project = await SpaceFactory.project(workspace, user.id);
    const file = await ProjectFileFactory.create(auth, user, project, {
      contentType: "text/plain",
      fileName: "to-remove.txt",
      fileSize: 123,
      status: "ready",
    });

    const fr = await ContentFragmentModel.findOne({
      where: {
        workspaceId: workspace.id,
        spaceId: project.id,
        fileId: file.id,
      },
    });
    expect(fr).toBeTruthy();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${project.sId}/project_context/files/${file.sId}`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(200);

    const fileAfter = await FileModel.findOne({
      where: { workspaceId: workspace.id, id: file.id },
    });
    expect(fileAfter).toBeNull();
  });

  it("returns 400 when space is not a project", async () => {
    const { auth, workspace, globalSpace, user } =
      await createPrivateApiMockRequest({ role: "user" });

    const file = await ProjectFileFactory.create(auth, user, globalSpace, {
      contentType: "text/plain",
      fileName: "nope.txt",
      fileSize: 10,
      status: "ready",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${globalSpace.sId}/project_context/files/${file.sId}`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("does not delete a project file that belongs to another pod", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const ownProject = await SpaceFactory.project(workspace, user.id);
    const otherProject = await SpaceFactory.project(workspace);
    const file = await ProjectFileFactory.create(auth, user, otherProject, {
      contentType: "text/plain",
      fileName: "other-pod.txt",
      fileSize: 20,
      status: "ready",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${ownProject.sId}/project_context/files/${file.sId}`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toBe("File not found.");
    await expect(FileResource.fetchById(auth, file.sId)).resolves.toEqual(
      expect.objectContaining({ sId: file.sId })
    );
  });

  it("does not delete a file that is not project context", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const project = await SpaceFactory.project(workspace, user.id);
    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "attachment.txt",
      fileSize: 20,
      status: "ready",
      useCase: "conversation",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${project.sId}/project_context/files/${file.sId}`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toBe("File not found.");
    await expect(FileResource.fetchById(auth, file.sId)).resolves.toEqual(
      expect.objectContaining({ sId: file.sId })
    );
  });

  it("does not delete a Frame that belongs to another pod", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const ownProject = await SpaceFactory.project(workspace, user.id);
    const otherProject = await SpaceFactory.project(workspace);
    const file = await ProjectFileFactory.create(auth, user, otherProject, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 20,
      status: "ready",
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/spaces/${ownProject.sId}/project_context/files/${file.sId}`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toBe("File not found.");
    await expect(FileResource.fetchById(auth, file.sId)).resolves.toEqual(
      expect.objectContaining({ sId: file.sId })
    );
  });
});
