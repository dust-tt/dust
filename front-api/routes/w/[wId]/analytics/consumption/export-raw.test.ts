import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { describeWorkflowMock, startWorkflowMock } = vi.hoisted(() => ({
  describeWorkflowMock: vi.fn().mockResolvedValue({
    status: { name: "COMPLETED" },
  }),
  startWorkflowMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/temporal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/temporal")>();
  return {
    ...actual,
    getTemporalClientForFrontNamespace: vi.fn().mockResolvedValue({
      workflow: {
        start: startWorkflowMock,
        getHandle: vi.fn().mockReturnValue({ describe: describeWorkflowMock }),
      },
    }),
  };
});

beforeEach(() => {
  describeWorkflowMock.mockResolvedValue({ status: { name: "COMPLETED" } });
  startWorkflowMock.mockResolvedValue(undefined);
  // No cached export by default, so POST tests exercise the actual workflow start.
  fileStorageMock.setFileExists(() => false);
});

async function setupTest({
  role = "admin",
}: {
  role?: MembershipRoleType;
} = {}) {
  return createPrivateApiMockRequest({ role });
}

function postExportStatusRequest(
  wId: string,
  body: Record<string, unknown>,
  personal = false
) {
  const analyticsPath = personal ? "me/analytics" : "analytics";
  return honoApp.request(
    `/api/w/${wId}/${analyticsPath}/consumption/export-raw/status`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function postExportRawRequest(
  wId: string,
  body: Record<string, unknown>,
  personal = false
) {
  const analyticsPath = personal ? "me/analytics" : "analytics";
  return honoApp.request(
    `/api/w/${wId}/${analyticsPath}/consumption/export-raw`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function getDownloadRequest(wId: string, name: string) {
  return honoApp.request(
    `/api/w/${wId}/analytics/consumption/export-raw/${name}/download`,
    { redirect: "manual" }
  );
}

describe("POST /api/w/:wId/analytics/consumption/export-raw/status", () => {
  it("is refused to non-managers by default", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postExportStatusRequest(workspace.sId, {});

    expect(response.status).toBe(403);
  });

  it("returns an empty list and not-generating/not-ready when nothing exists", async () => {
    fileStorageMock.setFilesByPrefix(() => []);
    const { workspace } = await setupTest();

    const response = await postExportStatusRequest(workspace.sId, {});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.exports).toEqual([]);
    expect(body.isGenerating).toBe(false);
    expect(body.isReady).toBe(false);
    expect(typeof body.exportId).toBe("string");
  });

  it("lists past exports for the workspace, newest first", async () => {
    const { workspace } = await setupTest();
    const prefix = `w/${workspace.sId}/consumption_exports/`;
    fileStorageMock.setFilesByPrefix((requestedPrefix) => {
      if (requestedPrefix !== prefix) {
        return null;
      }
      return [
        {
          name: `${prefix}1000.csv`,
          metadata: {
            timeCreated: "2026-08-01T00:00:00.000Z",
            size: "100",
          },
        },
        {
          name: `${prefix}2000.csv`,
          metadata: {
            timeCreated: "2026-08-02T00:00:00.000Z",
            size: "200",
          },
        },
      ];
    });

    const response = await postExportStatusRequest(workspace.sId, {});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isGenerating).toBe(false);
    expect(body.exports).toEqual([
      {
        name: "2000.csv",
        createdAt: "2026-08-02T00:00:00.000Z",
        sizeBytes: 200,
      },
      {
        name: "1000.csv",
        createdAt: "2026-08-01T00:00:00.000Z",
        sizeBytes: 100,
      },
    ]);
  });

  it("reports isGenerating when the workflow for this exact period+filter is running", async () => {
    describeWorkflowMock.mockResolvedValue({ status: { name: "RUNNING" } });
    fileStorageMock.setFilesByPrefix(() => []);
    const { workspace } = await setupTest();

    const response = await postExportStatusRequest(workspace.sId, {});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.exports).toEqual([]);
    expect(body.isGenerating).toBe(true);
  });

  it("reports isReady when a cached export exists for this exact period+filter", async () => {
    fileStorageMock.setFileExists(() => true);
    fileStorageMock.setFilesByPrefix(() => []);
    const { workspace } = await setupTest();

    const response = await postExportStatusRequest(workspace.sId, {});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isReady).toBe(true);
  });

  it("returns only the signed export for a member's own scope", async () => {
    fileStorageMock.setFileExists(() => true);
    fileStorageMock.setFileMetadata(() => ({
      contentType: "text/csv",
      size: "123",
    }));
    const { workspace } = await setupTest({ role: "user" });

    const response = await postExportStatusRequest(
      workspace.sId,
      { filter: { users: ["another-user"] } },
      true
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.exports).toEqual([
      {
        name: `${body.exportId}.csv`,
        createdAt: new Date(0).toISOString(),
        sizeBytes: 123,
        downloadUrl: "https://signed-url.test",
      },
    ]);
  });
});

describe("GET /api/w/:wId/analytics/consumption/export-raw/:name/download", () => {
  it("redirects to a freshly signed download url", async () => {
    const { workspace } = await setupTest();

    const response = await getDownloadRequest(workspace.sId, "2000.csv");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://signed-url.test");
  });

  it("rejects a file name that escapes the workspace's export prefix", async () => {
    const { workspace } = await setupTest();

    const response = await getDownloadRequest(
      workspace.sId,
      "..%2f..%2fother-workspace%2f2000.csv"
    );

    expect(response.status).toBe(404);
  });

  it("is refused to non-managers", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await getDownloadRequest(workspace.sId, "2000.csv");

    expect(response.status).toBe(403);
  });
});

describe("POST /api/w/:wId/analytics/consumption/export-raw", () => {
  it("starts the export workflow and returns immediately", async () => {
    const { workspace } = await setupTest({ role: "admin" });

    const response = await postExportRawRequest(workspace.sId, {});

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ isGenerating: true });
    expect(startWorkflowMock).toHaveBeenCalledTimes(1);
  });

  it("starts a member export with the authenticated user's filter", async () => {
    const { workspace, user } = await setupTest({ role: "user" });

    const response = await postExportRawRequest(
      workspace.sId,
      { filter: { users: ["another-user"], sources: ["slack"] } },
      true
    );

    expect(response.status).toBe(202);
    const workflowOptions = startWorkflowMock.mock.calls[0]?.[1];
    expect(workflowOptions?.args[1].filter).toEqual({
      users: [user.sId],
      sources: ["slack"],
    });
  });

  it("returns the cached export's name instead of starting a new workflow when one already exists", async () => {
    fileStorageMock.setFileExists(() => true);
    const { workspace } = await setupTest({ role: "admin" });

    const response = await postExportRawRequest(workspace.sId, {});

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isGenerating).toBe(false);
    expect(body.name).toMatch(/^[A-Za-z0-9_-]+\.csv$/);
    expect(startWorkflowMock).not.toHaveBeenCalled();
  });

  it("returns a signed URL for a member's cached export", async () => {
    fileStorageMock.setFileExists(() => true);
    const { workspace } = await setupTest({ role: "user" });

    const response = await postExportRawRequest(workspace.sId, {}, true);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      isGenerating: false,
      downloadUrl: "https://signed-url.test",
    });
    expect(startWorkflowMock).not.toHaveBeenCalled();
  });

  it("is refused to non-managers", async () => {
    const { workspace } = await setupTest({ role: "user" });

    const response = await postExportRawRequest(workspace.sId, {});

    expect(response.status).toBe(403);
    expect(startWorkflowMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    const { workspace } = await setupTest();

    const response = await postExportRawRequest(workspace.sId, {
      days: "not-a-number",
    });

    expect(response.status).toBe(400);
  });

  it("returns a 5xx and does not report isGenerating when the workflow fails to launch", async () => {
    startWorkflowMock.mockRejectedValue(new Error("temporal unavailable"));
    const { workspace } = await setupTest({ role: "admin" });

    const response = await postExportRawRequest(workspace.sId, {});

    expect(response.status).toBeGreaterThanOrEqual(500);
    const body = await response.json();
    expect(body).not.toEqual({ isGenerating: true });
  });
});
