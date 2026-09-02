import { makeTestFrameInvocation } from "@app/tests/utils/FrameFunctionFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function invocationsUrl(
  workspaceId: string,
  frameId: string,
  functionId: string
) {
  return `/api/poke/workspaces/${workspaceId}/frames/${frameId}/functions/${functionId}/invocations`;
}

describe("GET .../frames/:frameId/functions/:functionId/invocations", () => {
  it("lists the function's invocations", async () => {
    const { workspace, frame, sandboxFunction, invocation } =
      await makeTestFrameInvocation({ isSuperUser: true });

    const response = await honoApp.request(
      invocationsUrl(workspace.sId, frame.sId, sandboxFunction.sId)
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      sId: invocation.sId,
      mcpActionCount: 0,
    });
  });

  it("returns one invocation with its MCP actions", async () => {
    const { workspace, frame, sandboxFunction, invocation } =
      await makeTestFrameInvocation({ isSuperUser: true });

    const response = await honoApp.request(
      `${invocationsUrl(workspace.sId, frame.sId, sandboxFunction.sId)}/${invocation.sId}`
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.invocation).toMatchObject({
      sId: invocation.sId,
      input: { message: "hello" },
      mcpActions: [],
    });
  });

  it("404s for an unknown invocation", async () => {
    const { workspace, frame, sandboxFunction } = await makeTestFrameInvocation(
      { isSuperUser: true }
    );

    const response = await honoApp.request(
      `${invocationsUrl(workspace.sId, frame.sId, sandboxFunction.sId)}/inv_doesnotexist`
    );

    expect(response.status).toBe(404);
  });
});
