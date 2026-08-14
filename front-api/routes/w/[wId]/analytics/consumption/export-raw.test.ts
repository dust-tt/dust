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
});

async function setupTest({
  role = "admin",
}: {
  role?: MembershipRoleType;
} = {}) {
  return createPrivateApiMockRequest({ role });
}

function getExportRawRequest(wId: string) {
  return honoApp.request(`/api/w/${wId}/analytics/consumption/export-raw`);
}

function postExportRawRequest(wId: string, body: Record<string, unknown>) {
  return honoApp.request(`/api/w/${wId}/analytics/consumption/export-raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/w/:wId/analytics/consumption/export-raw", () => {
  it("returns an empty list and not-generating when nothing exists", async () => {
    fileStorageMock.setFilesByPrefix(() => []);
    const { workspace } = await setupTest();

    const response = await getExportRawRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ exports: [], isGenerating: false });
  });

  it("lists past exports for the workspace, newest first, with a download url", async () => {
    const { workspace } = await setupTest();
    const prefix = `consumption_exports/w/${workspace.sId}/`;
    fileStorageMock.setFilesByPrefix((requestedPrefix) => {
      if (requestedPrefix !== prefix) {
        return null;
      }
      return [
        {
          name: `${prefix}1000.zip`,
          metadata: {
            timeCreated: "2026-08-01T00:00:00.000Z",
            size: "100",
          },
        },
        {
          name: `${prefix}2000.zip`,
          metadata: {
            timeCreated: "2026-08-02T00:00:00.000Z",
            size: "200",
          },
        },
      ];
    });

    const response = await getExportRawRequest(workspace.sId);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isGenerating).toBe(false);
    expect(body.exports).toEqual([
      {
        name: "2000.zip",
        createdAt: "2026-08-02T00:00:00.000Z",
        sizeBytes: 200,
        downloadUrl: "https://signed-url.test",
      },
      {
        name: "1000.zip",
        createdAt: "2026-08-01T00:00:00.000Z",
        sizeBytes: 100,
        downloadUrl: "https://signed-url.test",
      },
    ]);
  });

  it("reports isGenerating when the workspace's export workflow is running", async () => {
    describeWorkflowMock.mockResolvedValue({ status: { name: "RUNNING" } });
    fileStorageMock.setFilesByPrefix(() => []);
    const { workspace } = await setupTest();

    const response = await getExportRawRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ exports: [], isGenerating: true });
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
