import { sendMCPGlobalSharingReconfigurationEmail } from "@app/lib/api/email";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./index";

vi.mock(import("@app/lib/api/email"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    sendMCPGlobalSharingReconfigurationEmail: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(sendMCPGlobalSharingReconfigurationEmail).mockReset();
  vi.mocked(sendMCPGlobalSharingReconfigurationEmail).mockResolvedValue(
    new Ok(undefined)
  );
});

describe("GET /api/w/[wId]/spaces/[spaceId]/mcp_views", () => {
  it("returns MCP servers views", async () => {
    const { req, res, systemSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    req.query.spaceId = systemSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      serverViews: expect.any(Array),
    });
  });
});

describe("POST /api/w/[wId]/spaces/[spaceId]/mcp_views", () => {
  it("should return 400 when a view with the same name already exists in the space", async () => {
    const { req, res, workspace, authenticator, globalSpace } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(authenticator);

    // Create two remote MCP servers with the same name.
    const server1 = await RemoteMCPServerFactory.create(workspace, {
      name: "duplicate-name",
    });
    const server2 = await RemoteMCPServerFactory.create(workspace, {
      name: "duplicate-name",
    });

    // Add the first server's view to the global space.
    const systemView1 =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        authenticator,
        server1.sId
      );
    expect(systemView1).not.toBeNull();
    await MCPServerViewResource.create(authenticator, {
      systemView: systemView1!,
      space: globalSpace,
    });

    // Try to add the second server (same name) to the same space.
    req.query.spaceId = globalSpace.sId;
    req.body = { mcpServerId: server2.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.message).toContain("duplicate-name");
  });

  it("should allow views with the same name in different spaces", async () => {
    const { req, res, workspace, authenticator, globalSpace, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(authenticator);

    const regularSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(regularSpace, globalGroup);

    // Create two remote MCP servers with the same name.
    const server1 = await RemoteMCPServerFactory.create(workspace, {
      name: "shared-name",
    });
    const server2 = await RemoteMCPServerFactory.create(workspace, {
      name: "shared-name",
    });

    // Add the first server's view to the global space.
    const systemView1 =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        authenticator,
        server1.sId
      );
    expect(systemView1).not.toBeNull();
    await MCPServerViewResource.create(authenticator, {
      systemView: systemView1!,
      space: globalSpace,
    });

    // Add the second server (same name) to a different space — should succeed.
    req.query.spaceId = regularSpace.sId;
    req.body = { mcpServerId: server2.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().success).toBe(true);
  });

  it("emails workspace admins with affected latest active agent names when sharing globally", async () => {
    const {
      req,
      res,
      workspace,
      user,
      authenticator,
      globalSpace,
      globalGroup,
    } = await createPrivateApiMockRequest({
      role: "admin",
      method: "POST",
    });

    await SpaceFactory.defaults(authenticator);

    const regularSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(regularSpace, globalGroup);

    const extraAdmin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, extraAdmin, { role: "admin" });

    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Notion",
    });
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        authenticator,
        server.sId
      );

    expect(systemView).not.toBeNull();

    const regularView = await MCPServerViewResource.create(authenticator, {
      systemView: systemView!,
      space: regularSpace,
    });

    const impactedAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Needs Reconfiguration",
      }
    );
    await AgentMCPServerConfigurationFactory.create(
      authenticator,
      regularSpace,
      {
        agent: impactedAgent,
        mcpServerView: regularView,
      }
    );

    const staleAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Stale Agent",
      }
    );
    await AgentMCPServerConfigurationFactory.create(
      authenticator,
      regularSpace,
      {
        agent: staleAgent,
        mcpServerView: regularView,
      }
    );
    await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      staleAgent.sId,
      {
        name: "Stale Agent",
      }
    );

    req.query.spaceId = globalSpace.sId;
    req.body = { mcpServerId: server.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const emailCalls = vi
      .mocked(sendMCPGlobalSharingReconfigurationEmail)
      .mock.calls.map(([args]) => args);

    expect(emailCalls).toHaveLength(2);
    expect(emailCalls.map((call) => call.email).sort()).toEqual(
      [user.email, extraAdmin.email].sort()
    );
    emailCalls.forEach((call) => {
      expect(call.workspaceName).toBe(workspace.name);
      expect(call.toolName).toBe("Notion");
      expect(call.agentNames).toEqual(["Needs Reconfiguration"]);
    });
  });

  it("does not fail the sharing request when the notification email fails", async () => {
    vi.mocked(sendMCPGlobalSharingReconfigurationEmail).mockResolvedValue(
      new Err(new Error("email failed"))
    );

    const { req, res, workspace, authenticator, globalSpace, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(authenticator);

    const regularSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(regularSpace, globalGroup);

    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Notion",
    });
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        authenticator,
        server.sId
      );

    expect(systemView).not.toBeNull();

    const regularView = await MCPServerViewResource.create(authenticator, {
      systemView: systemView!,
      space: regularSpace,
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Needs Reconfiguration",
      }
    );
    await AgentMCPServerConfigurationFactory.create(
      authenticator,
      regularSpace,
      {
        agent,
        mcpServerView: regularView,
      }
    );

    req.query.spaceId = globalSpace.sId;
    req.body = { mcpServerId: server.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().success).toBe(true);
  });
});
