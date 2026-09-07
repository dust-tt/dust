import { FileFactory } from "@app/tests/utils/FileFactory";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { frameV2ContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function functionsUrl(workspaceId: string, frameId: string) {
  return `/api/poke/workspaces/${workspaceId}/frames/${frameId}/functions`;
}

describe("GET /api/poke/workspaces/:wId/frames/:frameId/functions", () => {
  it("returns the active publication's functions", async () => {
    const { workspace, frame, sandboxFunction } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    const response = await honoApp.request(
      functionsUrl(workspace.sId, frame.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      sId: sandboxFunction.sId,
      slug: "run-function",
      description: "Run the Frame function.",
    });
  });

  it("returns an empty list for a Frame that has never been published", async () => {
    const { workspace, adminAuth } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    const unpublished = await FileFactory.create(adminAuth, null, {
      contentType: frameV2ContentType,
      fileName: "unpublished.json",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "con_test" },
    });

    const response = await honoApp.request(
      functionsUrl(workspace.sId, unpublished.sId)
    );

    expect(response.status).toBe(200);
    expect((await response.json()).items).toEqual([]);
  });

  it("404s for a Frame in another workspace", async () => {
    const { frame } = await makeTestFrameFunction({ isSuperUser: true });
    const { workspace: otherWorkspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const response = await honoApp.request(
      functionsUrl(otherWorkspace.sId, frame.sId)
    );

    expect(response.status).toBe(404);
  });
});
