import { readFramePublicationFunctionBundle } from "@app/lib/api/frames/publication_storage";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The published bundle of a Frame function lives in GCS.
vi.mock(import("@app/lib/api/frames/publication_storage"), async (orig) => {
  const mod = await orig();
  return { ...mod, readFramePublicationFunctionBundle: vi.fn() };
});

function functionUrl(workspaceId: string, frameId: string, functionId: string) {
  return `/api/poke/workspaces/${workspaceId}/frames/${frameId}/functions/${functionId}`;
}

describe("GET /api/poke/workspaces/:wId/frames/:frameId/functions/:functionId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the function's contract and flags it as the active publication", async () => {
    const { workspace, frame, sandboxFunction } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    const response = await honoApp.request(
      functionUrl(workspace.sId, frame.sId, sandboxFunction.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.frameFunction).toMatchObject({
      sId: sandboxFunction.sId,
      slug: "run-function",
      name: "run-function",
      description: "Run the Frame function.",
      publicationId: "publication-1",
      userIdentity: "optional",
      executionMode: "durable",
      defaultStake: "low",
      isActivePublication: true,
    });
    // A Frame function's fileId is the Frame manifest, not a bundle, so it must not be surfaced.
    expect(data.frameFunction).not.toHaveProperty("fileId");
  });

  it("resolves a superseded publication's function and flags it as not active", async () => {
    const { workspace, frame, adminAuth } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    await withTransaction((transaction) =>
      SandboxFunctionResource.createForFramePublication(
        adminAuth,
        {
          frame,
          publicationId: "publication-0",
          functions: [
            {
              name: "old-function",
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
    const superseded =
      await SandboxFunctionResource.fetchByFramePublicationAndSlug(adminAuth, {
        frame,
        publicationId: "publication-0",
        slug: "old-function",
      });
    if (!superseded) {
      throw new Error("Expected the superseded Frame function to exist.");
    }

    const response = await honoApp.request(
      functionUrl(workspace.sId, frame.sId, superseded.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.frameFunction).toMatchObject({
      publicationId: "publication-0",
      isActivePublication: false,
    });
  });

  it("404s for a function belonging to another Frame", async () => {
    const other = await makeTestFrameFunction({ isSuperUser: true });
    const { workspace, frame, sandboxFunction } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    const crossFrame = await honoApp.request(
      functionUrl(workspace.sId, frame.sId, other.sandboxFunction.sId)
    );
    expect(crossFrame.status).toBe(404);

    // Asserting the 404 alone would also pass if the route were simply broken, so pin that this
    // Frame's own function IS reachable through the same URL shape.
    const ownFunction = await honoApp.request(
      functionUrl(workspace.sId, frame.sId, sandboxFunction.sId)
    );
    expect(ownFunction.status).toBe(200);
  });
});

describe("GET .../frames/:frameId/functions/:functionId/source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the published bundle", async () => {
    const { workspace, frame, sandboxFunction } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    vi.mocked(readFramePublicationFunctionBundle).mockResolvedValue(
      new Ok("export default { fetch: async () => Response.json({}) };")
    );

    const response = await honoApp.request(
      `${functionUrl(workspace.sId, frame.sId, sandboxFunction.sId)}/source`
    );

    expect(response.status).toBe(200);
    expect((await response.json()).source).toBe(
      "export default { fetch: async () => Response.json({}) };"
    );
    // The bundle is keyed by the bare function name, not the slug.
    expect(readFramePublicationFunctionBundle).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        publicationId: "publication-1",
        functionName: "run-function",
      })
    );
  });

  it("404s when the bundle is missing from storage", async () => {
    const { workspace, frame, sandboxFunction } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    const { FramePublicationError } = await vi.importActual<
      typeof import("@app/lib/api/frames/publication_storage")
    >("@app/lib/api/frames/publication_storage");
    vi.mocked(readFramePublicationFunctionBundle).mockResolvedValue(
      new Err(new FramePublicationError("publication_not_found", "gone"))
    );

    const response = await honoApp.request(
      `${functionUrl(workspace.sId, frame.sId, sandboxFunction.sId)}/source`
    );

    expect(response.status).toBe(404);
  });
});
