import { FramePublicationResource } from "@app/lib/resources/frame_publication_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { FramePublicationModel } from "@app/lib/resources/storage/models/frame_publication";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

const SUPERSEDED_PUBLICATION_ID = "publication-0";

function publicationsUrl(workspaceId: string, frameId: string) {
  return `/api/poke/workspaces/${workspaceId}/frames/${frameId}/publications`;
}

describe("GET /api/poke/workspaces/:wId/frames/:frameId/publications", () => {
  it("lists every publication newest first, with its function and invocation counts", async () => {
    const { workspace, adminAuth, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });
    // makeTestFrameFunction's Frame serves `publication-1`; add an older, superseded publication
    // whose function still has a run on record.
    await FramePublicationResource.makeNew(adminAuth, {
      frame,
      publicationId: SUPERSEDED_PUBLICATION_ID,
    });
    await FramePublicationModel.update(
      { createdAt: new Date(Date.now() - ONE_DAY_MS) },
      {
        where: {
          workspaceId: workspace.id,
          fileId: frame.id,
          publicationId: SUPERSEDED_PUBLICATION_ID,
        },
      }
    );
    await FramePublicationResource.makeNew(adminAuth, {
      frame,
      publicationId: "publication-1",
    });
    await withTransaction((transaction) =>
      SandboxFunctionResource.createForFramePublication(
        adminAuth,
        {
          frame,
          publicationId: SUPERSEDED_PUBLICATION_ID,
          functions: [
            {
              name: "run-function",
              description: "Run the Frame function.",
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
    const [supersededFunction] =
      await SandboxFunctionResource.listByFramePublication(adminAuth, {
        frame,
        publicationId: SUPERSEDED_PUBLICATION_ID,
      });
    await SandboxFunctionInvocationResource.makeNew(adminAuth, {
      sandboxFunction: supersededFunction,
      input: {},
    });

    const response = await honoApp.request(
      publicationsUrl(workspace.sId, frame.sId)
    );

    expect(response.status).toBe(200);
    const publisher = adminAuth.getNonNullableUser().fullName();
    expect((await response.json()).items).toMatchObject([
      {
        publicationId: "publication-1",
        publisher,
        isActive: true,
        functionCount: 1,
        invocationCount: 0,
      },
      {
        publicationId: SUPERSEDED_PUBLICATION_ID,
        publisher,
        isActive: false,
        functionCount: 1,
        invocationCount: 1,
      },
    ]);
  });

  it("404s for a Frame in another workspace", async () => {
    const { frame } = await makeTestFrameFunction({ isSuperUser: true });
    const { workspace: otherWorkspace } = await createPokeApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const response = await honoApp.request(
      publicationsUrl(otherWorkspace.sId, frame.sId)
    );

    expect(response.status).toBe(404);
  });
});
