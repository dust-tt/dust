import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { describe, expect, it } from "vitest";

const SUPERSEDED_PUBLICATION_ID = "publication-0";

function functionNamesUrl(workspaceId: string, frameId: string) {
  return `/api/poke/workspaces/${workspaceId}/frames/${frameId}/function-names`;
}

// makeTestFrameFunction's Frame serves `publication-1`, whose one function is `run-function`. Add
// a superseded publication declaring `run-function` again plus `old-function`, which the active
// publication dropped.
async function addSupersededPublication(
  auth: Authenticator,
  frame: FileResource
) {
  await withTransaction((transaction) =>
    SandboxFunctionResource.createForFramePublication(
      auth,
      {
        frame,
        publicationId: SUPERSEDED_PUBLICATION_ID,
        functions: ["run-function", "old-function"].map((name) => ({
          name,
          description: `The ${name} function.`,
          userIdentity: "optional" as const,
          executionMode: "durable" as const,
          defaultStake: "low" as const,
          bundleCode: "export default {};",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        })),
      },
      transaction
    )
  );

  const supersededRun =
    await SandboxFunctionResource.fetchByFramePublicationAndSlug(auth, {
      frame,
      publicationId: SUPERSEDED_PUBLICATION_ID,
      slug: "run-function",
    });
  assert(supersededRun, "The superseded run-function version must exist.");

  return supersededRun;
}

describe("GET /api/poke/workspaces/:wId/frames/:frameId/function-names", () => {
  it("lists each function name once, across publications", async () => {
    const { workspace, adminAuth, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });
    const supersededRun = await addSupersededPublication(adminAuth, frame);
    await SandboxFunctionInvocationResource.makeNew(adminAuth, {
      sandboxFunction: supersededRun,
      input: {},
    });

    const response = await honoApp.request(
      functionNamesUrl(workspace.sId, frame.sId)
    );

    expect(response.status).toBe(200);
    expect((await response.json()).items).toMatchObject([
      { slug: "old-function", versionCount: 1, isInActivePublication: false },
      {
        slug: "run-function",
        versionCount: 2,
        invocationCount: 1,
        isInActivePublication: true,
      },
    ]);
  });

  it("lists every version of a name, and invocations across them", async () => {
    const { workspace, adminAuth, frame, sandboxFunction } =
      await makeTestFrameFunction({ isSuperUser: true });
    const supersededRun = await addSupersededPublication(adminAuth, frame);
    await SandboxFunctionInvocationResource.makeNew(adminAuth, {
      sandboxFunction: supersededRun,
      input: {},
    });
    await SandboxFunctionInvocationResource.makeNew(adminAuth, {
      sandboxFunction,
      input: {},
    });

    const versionsResponse = await honoApp.request(
      `${functionNamesUrl(workspace.sId, frame.sId)}/run-function`
    );
    expect(versionsResponse.status).toBe(200);
    const { versions } = await versionsResponse.json();
    expect(
      versions.map(
        ({
          publicationId,
          isActivePublication,
          invocationCount,
        }: {
          publicationId: string;
          isActivePublication: boolean;
          invocationCount: number;
        }) => ({ publicationId, isActivePublication, invocationCount })
      )
    ).toEqual(
      expect.arrayContaining([
        {
          publicationId: "publication-1",
          isActivePublication: true,
          invocationCount: 1,
        },
        {
          publicationId: SUPERSEDED_PUBLICATION_ID,
          isActivePublication: false,
          invocationCount: 1,
        },
      ])
    );

    const invocationsResponse = await honoApp.request(
      `${functionNamesUrl(workspace.sId, frame.sId)}/run-function/invocations`
    );
    expect(invocationsResponse.status).toBe(200);
    const { items } = await invocationsResponse.json();
    expect(
      items
        .map(
          ({
            functionId,
            publicationId,
          }: {
            functionId: string;
            publicationId: string;
          }) => ({ functionId, publicationId })
        )
        .sort((a: { publicationId: string }, b: { publicationId: string }) =>
          a.publicationId.localeCompare(b.publicationId)
        )
    ).toEqual([
      {
        functionId: supersededRun.sId,
        publicationId: SUPERSEDED_PUBLICATION_ID,
      },
      { functionId: sandboxFunction.sId, publicationId: "publication-1" },
    ]);
  });

  it("404s for a name the Frame has no function for", async () => {
    const { workspace, frame } = await makeTestFrameFunction({
      isSuperUser: true,
    });

    for (const path of ["no-such-function", "no-such-function/invocations"]) {
      const response = await honoApp.request(
        `${functionNamesUrl(workspace.sId, frame.sId)}/${path}`
      );
      expect(response.status).toBe(404);
    }
  });

  it("404s for a Frame in another workspace", async () => {
    const { frame } = await makeTestFrameFunction({ isSuperUser: true });
    const { workspace: otherWorkspace } = await createPokeApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const response = await honoApp.request(
      functionNamesUrl(otherWorkspace.sId, frame.sId)
    );

    expect(response.status).toBe(404);
  });
});
