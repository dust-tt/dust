import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function framesUrl(workspaceId: string) {
  return `/api/poke/workspaces/${workspaceId}/frames`;
}

describe("GET /api/poke/workspaces/:wId/frames", () => {
  it("lists Frames v2 with their function count and originating conversation", async () => {
    const { workspace, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    const response = await honoApp.request(framesUrl(workspace.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      sId: frame.sId,
      fileName: "manifest.json",
      name: "Task List",
      description: "Track tasks.",
      status: "ready",
      activePublicationId: "publication-1",
      functionCount: 1,
      sandboxStatus: null,
    });
    expect(data.totalCount).toBe(1);
  });

  it("counts only the active publication's functions", async () => {
    const { workspace, frame, adminAuth } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    // Function rows accumulate per publish and are never pruned, so a frame published more than
    // once would report an inflated count if the query were not scoped to the active publication.
    await withTransaction((transaction) =>
      SandboxFunctionResource.createForFramePublication(
        adminAuth,
        {
          frame,
          publicationId: "publication-0",
          functions: [
            {
              name: "stale-function",
              description: "A function from a superseded publication.",
              userIdentity: "optional",
              executionMode: "durable",
              defaultStake: "low",
              bundleCode: "export default {};",
              inputSchema: { type: "object" },
              outputSchema: { type: "object" },
            },
          ],
        },
        transaction
      )
    );

    // Prove the setup actually created a second function row, so a count of 1 below means
    // "scoped to the active publication" rather than "the stale function was never created".
    const stale = await SandboxFunctionResource.fetchByFramePublicationAndSlug(
      adminAuth,
      { frame, publicationId: "publication-0", slug: "stale-function" }
    );
    expect(stale).not.toBeNull();

    const response = await honoApp.request(framesUrl(workspace.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].functionCount).toBe(1);
  });

  it("excludes v1 interactive content and other files", async () => {
    const { workspace, adminAuth } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    await FileFactory.create(adminAuth, null, {
      contentType: frameContentType,
      fileName: "legacy.tsx",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });
    await FileFactory.create(adminAuth, null, {
      contentType: "text/csv",
      fileName: "data.csv",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    const response = await honoApp.request(framesUrl(workspace.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].fileName).toBe("manifest.json");
  });

  it("orders by updatedAt desc and pages with limit/offset over the total count", async () => {
    const { workspace, adminAuth } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    await FileFactory.create(adminAuth, null, {
      contentType: frameV2ContentType,
      fileName: "second.json",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "con_test" },
    });

    // Assert the ordering over the whole page rather than naming which row comes first: two rows
    // created in the same millisecond would make a positional assertion flaky.
    const ordered = await honoApp.request(
      `${framesUrl(workspace.sId)}?limit=10&orderDirection=desc`
    );
    expect(ordered.status).toBe(200);
    const orderedData = await ordered.json();
    expect(orderedData.items).toHaveLength(2);
    expect(orderedData.totalCount).toBe(2);
    const timestamps = orderedData.items.map((item: { updatedAt: string }) =>
      new Date(item.updatedAt).getTime()
    );
    expect(timestamps[0]).toBeGreaterThanOrEqual(timestamps[1]);

    const firstPage = await honoApp.request(
      `${framesUrl(workspace.sId)}?limit=1&offset=0&orderDirection=desc`
    );
    expect(firstPage.status).toBe(200);
    const firstPageData = await firstPage.json();
    expect(firstPageData.items).toHaveLength(1);
    expect(firstPageData.totalCount).toBe(2);

    const secondPage = await honoApp.request(
      `${framesUrl(workspace.sId)}?limit=1&offset=1&orderDirection=desc`
    );
    expect(secondPage.status).toBe(200);
    const secondPageData = await secondPage.json();
    expect(secondPageData.items).toHaveLength(1);
    expect(secondPageData.totalCount).toBe(2);
    expect(secondPageData.items[0].sId).not.toBe(firstPageData.items[0].sId);
    expect(
      new Set(orderedData.items.map((item: { sId: string }) => item.sId))
    ).toEqual(
      new Set([firstPageData.items[0].sId, secondPageData.items[0].sId])
    );
  });

  it("does not leak frames from another workspace", async () => {
    // Order matters: each makeTestFrameFunction call re-mocks the WorkOS session, so the target
    // workspace must be created last for the request to authenticate as its own super user.
    await makeTestFrameFunction({ isSuperUser: true });
    const { workspace, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    const response = await honoApp.request(framesUrl(workspace.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].sId).toBe(frame.sId);
  });
});
