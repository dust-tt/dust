import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import {
  createSandboxFunctionInvocationTokenTestContext,
  createSandboxTokenTestContext,
} from "@app/tests/utils/SandboxTokenFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getSandboxActions(workspace: { sId: string }, token: string) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/sandbox/actions`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("GET /api/v1/w/[wId]/sandbox/actions", () => {
  it("returns server views when Computer is enabled", async () => {
    const { token, workspace } = await createSandboxTokenTestContext();

    const response = await getSandboxActions(workspace, token);

    expect(response.status).toBe(200);
    const body = await response.json();
    // The conversation's JIT servers resolve to auto MCP server views, which
    // are hydrated just in time on first read.
    expect(body.serverViews.length).toBeGreaterThan(0);
    for (const serverView of body.serverViews) {
      expect(serverView.server.availability).not.toBe("manual");
    }
  });

  it("returns 403 when Computer is disabled", async () => {
    const { token, workspace } = await createSandboxTokenTestContext({
      disableComputerFeature: true,
    });

    const response = await getSandboxActions(workspace, token);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Computer is disabled for this workspace.",
      },
    });
  });

  it("lists internal servers of the pod and global spaces for invocation tokens", async () => {
    const { auth, token, workspace, globalSpace } =
      await createSandboxFunctionInvocationTokenTestContext();

    const commonUtilities = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      { name: "common_utilities", useCase: null }
    );
    await MCPServerViewFactory.create(
      workspace,
      commonUtilities.id,
      globalSpace
    );
    const search = await InternalMCPServerInMemoryResource.makeNew(auth, {
      name: "search",
      useCase: null,
    });
    await MCPServerViewFactory.create(workspace, search.id, globalSpace);

    const response = await getSandboxActions(workspace, token);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.serverViews
        .map((sv: { server: { name: string } }) => sv.server.name)
        .sort()
    ).toEqual(["common_utilities", "search"]);
  });
});
