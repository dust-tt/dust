import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ProjectFileFactory } from "@app/tests/utils/ProjectFileFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./[fileId]";

describe("/api/w/[wId]/spaces/[spaceId]/project_context/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DELETE removes the file from project context and returns 200", async () => {
    const { auth, req, res, workspace, user } =
      await createPrivateApiMockRequest({
        method: "DELETE",
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

    req.query.spaceId = project.sId;
    req.query.fileId = file.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const fileAfter = await FileModel.findOne({
      where: { workspaceId: workspace.id, id: file.id },
    });
    expect(fileAfter).toBeNull();
  });

  it("returns 400 when space is not a project", async () => {
    const { auth, req, res, globalSpace, user } =
      await createPrivateApiMockRequest({
        method: "DELETE",
        role: "user",
      });

    const file = await ProjectFileFactory.create(auth, user, globalSpace, {
      contentType: "text/plain",
      fileName: "nope.txt",
      fileSize: 10,
      status: "ready",
    });

    req.query.spaceId = globalSpace.sId;
    req.query.fileId = file.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });
});
