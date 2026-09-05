import { FILES_SERVER_NAME } from "@app/lib/api/actions/servers/files/metadata";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import {
  createSandboxFunctionInvocationTokenTestContext,
  createSandboxTokenTestContext,
} from "@app/tests/utils/SandboxTokenFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getSandboxActions(workspace: { sId: string }, token: string) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/sandbox/actions`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("GET /api/v1/w/[wId]/sandbox/actions", () => {
  // Posture lock (CODING_RULES [API4]): sandbox is mounted before /v1/w/:wId so
  // it runs sandboxAuth, not publicApiAuth. A sandbox token reaching the handler
  // (200) proves the dedicated sandbox sub-app handled it — don't remove.
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

  it("returns server views when the agent and conversation use different spaces", async () => {
    const { agentServerView, token, workspace } =
      await createSandboxTokenTestContext({
        usePodSpaceForConversation: true,
      });
    expect(agentServerView).not.toBeNull();

    const response = await getSandboxActions(workspace, token);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.serverViews.map((serverView: { sId: string }) => serverView.sId)
    ).toContain(agentServerView?.sId);
  });

  it("does not expose tools added to a later agent version", async () => {
    const { agentConfig, agentServerView, auth, token, workspace } =
      await createSandboxTokenTestContext({
        usePodSpaceForConversation: true,
      });
    expect(agentServerView).not.toBeNull();

    const laterSpace = await SpaceFactory.regular(workspace);
    const addMemberResult = await laterSpace.addMembers(auth, {
      userIds: [auth.getNonNullableUser().sId],
    });
    if (addMemberResult.isErr()) {
      throw addMemberResult.error;
    }
    await auth.refresh();

    const laterAgentConfig = await AgentConfigurationFactory.updateTestAgent(
      auth,
      agentConfig.sId,
      {
        requestedSpaceIds: [laterSpace.id],
      }
    );
    const laterServer = await RemoteMCPServerFactory.create(workspace, {
      name: "later_agent_space_server",
    });
    const laterServerView = await MCPServerViewFactory.create(
      workspace,
      laterServer.sId,
      laterSpace
    );
    await AgentMCPServerConfigurationFactory.create(auth, laterSpace, {
      agent: laterAgentConfig,
      mcpServerView: laterServerView,
    });

    const response = await getSandboxActions(workspace, token);

    expect(response.status).toBe(200);
    const body = await response.json();
    const serverViewIds = body.serverViews.map(
      (serverView: { sId: string }) => serverView.sId
    );
    expect(serverViewIds).toContain(agentServerView?.sId);
    expect(serverViewIds).not.toContain(laterServerView.sId);
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

  it("lists servers of the pod and global spaces for invocation tokens", async () => {
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
    const remoteServer = await RemoteMCPServerFactory.create(workspace, {
      name: "remote_server",
    });
    await MCPServerViewFactory.create(workspace, remoteServer.sId, globalSpace);

    const response = await getSandboxActions(workspace, token);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.serverViews
        .map((sv: { server: { name: string } }) => sv.server.name)
        .sort()
    ).toEqual(["common_utilities", "remote_server", "search"]);
  });

  it("hides the files server", async () => {
    const { auth, token, workspace, globalSpace } =
      await createSandboxFunctionInvocationTokenTestContext();

    const files = await InternalMCPServerInMemoryResource.makeNew(auth, {
      name: FILES_SERVER_NAME,
      useCase: null,
    });
    await MCPServerViewFactory.create(workspace, files.id, globalSpace);
    const search = await InternalMCPServerInMemoryResource.makeNew(auth, {
      name: "search",
      useCase: null,
    });
    await MCPServerViewFactory.create(workspace, search.id, globalSpace);

    const response = await getSandboxActions(workspace, token);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.serverViews.map((sv: { server: { name: string } }) => sv.server.name)
    ).toEqual(["search"]);
  });
});
