import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listGCSMountFilesMock = vi.hoisted(() => vi.fn());
const getConversationFileMountSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/files/gcs_mount/files", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/files/gcs_mount/files")>();
  return {
    ...actual,
    listGCSMountFiles: listGCSMountFilesMock,
    getConversationFileMountSignedUrl: getConversationFileMountSignedUrlMock,
  };
});

function getProjectFiles(
  workspace: { sId: string },
  key: { secret: string },
  spaceId: string,
  query: string = ""
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/spaces/${spaceId}/project_files${query}`,
    {
      headers: { authorization: `Bearer ${key.secret}` },
    }
  );
}

describe("GET /api/v1/w/[wId]/spaces/[spaceId]/project_files", () => {
  beforeEach(() => {
    listGCSMountFilesMock.mockReset();
    getConversationFileMountSignedUrlMock.mockReset();
    getConversationFileMountSignedUrlMock.mockResolvedValue(
      new Ok("https://signed.example/read")
    );
  });

  it("returns 403 if not system key", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: false,
    });

    const space = await SpaceFactory.project(workspace);

    const response = await getProjectFiles(workspace, key, space.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  });

  it("returns 404 if space does not exist", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const response = await getProjectFiles(
      workspace,
      key,
      "non-existent-space-id"
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "space_not_found",
        message: "Space not found.",
      },
    });
  });

  it("returns 400 for a non-project space", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.regular(workspace);

    const response = await getProjectFiles(workspace, key, space.sId);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "GCS mount files listing is only available for project spaces.",
      },
    });
  });

  it("returns files for a project space and filters by updatedSince", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.project(workspace);

    const mockFile = {
      isDirectory: false as const,
      fileName: "a.txt",
      path: "project/a.txt",
      sizeBytes: 3,
      lastModifiedMs: 2000,
      contentType: "text/plain",
      fileId: null,
      thumbnailUrl: null,
    };

    const mockFileWithUrl = {
      ...mockFile,
      signedDownloadUrl: "https://signed.example/read",
    };

    listGCSMountFilesMock.mockResolvedValue([
      mockFile,
      {
        isDirectory: false as const,
        fileName: "old.txt",
        path: "project/old.txt",
        sizeBytes: 1,
        lastModifiedMs: 500,
        contentType: "text/plain",
        fileId: null,
        thumbnailUrl: null,
      },
    ]);

    const response = await getProjectFiles(
      workspace,
      key,
      space.sId,
      "?updatedSince=1000"
    );

    expect(response.status).toBe(200);
    expect(listGCSMountFilesMock).toHaveBeenCalledWith(expect.anything(), {
      useCase: "project",
      projectId: space.sId,
    });
    expect(await response.json()).toEqual({
      files: [mockFileWithUrl],
    });
  });
});
