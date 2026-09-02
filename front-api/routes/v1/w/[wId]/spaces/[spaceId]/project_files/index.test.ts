import { getPrivateUploadBucket } from "@app/lib/file_storage";
import logger from "@app/logger/logger";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROJECT_FILES_MAX_CONCURRENT_REQUESTS_PER_PROCESS } from ".";

const getAllFilesByPrefixMock = vi.hoisted(() => vi.fn());
const getSignedUrlMock = vi.hoisted(() => vi.fn());
const fileExistsMock = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/file_storage/config", () => ({
  default: { getGcsPrivateUploadsBucket: vi.fn(() => "test-bucket") },
}));

function makeGCSFile(
  name: string,
  contentType = "text/plain",
  size = 1024,
  updatedMs = 2000
) {
  return {
    name,
    metadata: {
      contentType,
      size: String(size),
      updated: new Date(updatedMs).toISOString(),
    },
  };
}

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    getAllFilesByPrefixMock.mockReset();
    getAllFilesByPrefixMock.mockResolvedValue({ files: [], pageFetchCount: 1 });
    getSignedUrlMock.mockReset();
    getSignedUrlMock.mockResolvedValue("https://signed.example/read");
    fileExistsMock.mockReset();
    fileExistsMock.mockResolvedValue([true]);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({ exists: fileExistsMock })),
      getAllFilesByPrefix: getAllFilesByPrefixMock,
      getSignedUrl: getSignedUrlMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
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
        message: "Only system keys can perform this action.",
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

  it("returns files for a project space with canonical scoped paths", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.project(workspace);
    const prefix = `w/${workspace.sId}/pods/${space.sId}/files/`;

    getAllFilesByPrefixMock.mockResolvedValue({
      files: [makeGCSFile(`${prefix}a.txt`, "text/plain", 3, 2000)],
      pageFetchCount: 1,
    });

    const response = await getProjectFiles(workspace, key, space.sId);

    expect(response.status).toBe(200);
    expect(getAllFilesByPrefixMock).toHaveBeenCalledWith(
      expect.objectContaining({ prefix })
    );
    const body = await response.json();
    expect(body.files).toHaveLength(1);
    expect(body.files[0].path).toBe(`pod-${space.sId}/a.txt`);
    expect(body.files[0].signedDownloadUrl).toBe("https://signed.example/read");
  });

  it("filters by updatedSince", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.project(workspace);
    const prefix = `w/${workspace.sId}/pods/${space.sId}/files/`;

    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        makeGCSFile(`${prefix}a.txt`, "text/plain", 3, 2000),
        makeGCSFile(`${prefix}old.txt`, "text/plain", 1, 500),
      ],
      pageFetchCount: 1,
    });

    const response = await getProjectFiles(
      workspace,
      key,
      space.sId,
      "?updatedSince=1000"
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.files).toHaveLength(1);
    expect(body.files[0].path).toBe(`pod-${space.sId}/a.txt`);
  });

  it("limits concurrent connector listings and releases slots", async () => {
    const infoLog = vi.spyOn(logger, "info");
    const errorLog = vi.spyOn(logger, "error");
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.project(workspace);
    let releaseListings: (() => void) | undefined;
    const listingsReleased = new Promise<{
      files: never[];
      pageFetchCount: number;
    }>((resolve) => {
      releaseListings = () => resolve({ files: [], pageFetchCount: 1 });
    });
    getAllFilesByPrefixMock.mockImplementation(() => listingsReleased);

    const activeRequests = Array.from(
      { length: PROJECT_FILES_MAX_CONCURRENT_REQUESTS_PER_PROCESS },
      () => getProjectFiles(workspace, key, space.sId)
    );

    await vi.waitFor(() => {
      expect(getAllFilesByPrefixMock).toHaveBeenCalledTimes(
        PROJECT_FILES_MAX_CONCURRENT_REQUESTS_PER_PROCESS
      );
    });

    const rejectedResponse = await getProjectFiles(workspace, key, space.sId);

    expect(rejectedResponse.status).toBe(429);
    expect(rejectedResponse.headers.get("Retry-After")).toBe("1");
    expect(await rejectedResponse.json()).toEqual({
      error: {
        type: "rate_limit_error",
        message: "Too many concurrent project file listings. Retry later.",
      },
    });
    expect(infoLog).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        error: expect.objectContaining({
          message: "Too many concurrent project file listings. Retry later.",
        }),
      }),
      "API Error"
    );
    expect(errorLog).not.toHaveBeenCalled();

    releaseListings?.();
    const completedResponses = [];
    for (const request of activeRequests) {
      completedResponses.push(await request);
    }
    expect(
      completedResponses.every((response) => response.status === 200)
    ).toBe(true);

    getAllFilesByPrefixMock.mockResolvedValue({
      files: [],
      pageFetchCount: 1,
    });
    const responseAfterRelease = await getProjectFiles(
      workspace,
      key,
      space.sId
    );
    expect(responseAfterRelease.status).toBe(200);
  });
});
