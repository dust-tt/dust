import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { frameV2ContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function fileUrl(workspaceId: string, sId: string) {
  return `/api/poke/workspaces/${workspaceId}/files/${sId}`;
}

describe("GET /api/poke/workspaces/:wId/files/:sId", () => {
  it("returns a Frames v2 file instead of rejecting it", async () => {
    const { workspace, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    const response = await honoApp.request(fileUrl(workspace.sId, frame.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.file.sId).toBe(frame.sId);
    expect(data.file.contentType).toBe(frameV2ContentType);
    // A Frame v2's own bytes are its manifest JSON, which Poke's dedicated Frame view never
    // reads, so this endpoint deliberately serves an empty placeholder instead of fetching it.
    expect(data.content).toBe("");
  });

  it("404s for an unknown file", async () => {
    const { workspace } = await makeTestFrameFunction({ isSuperUser: true });

    const response = await honoApp.request(
      fileUrl(workspace.sId, "fil_doesnotexist")
    );

    expect(response.status).toBe(404);
  });
});
