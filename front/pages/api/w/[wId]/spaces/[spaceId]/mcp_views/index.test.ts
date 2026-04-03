import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import sgMail from "@sendgrid/mail";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./index";

type TemplateEmailMessage = {
  to: string;
  from: {
    name: string;
    email: string;
  };
  templateId: string;
  dynamic_template_data: {
    subject: string;
    body: string;
  };
};

vi.mock(import("@app/lib/api/config"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    default: {
      ...mod.default,
      getSendgridApiKey: vi.fn().mockReturnValue("SG.test"),
      getGenericEmailTemplate: vi.fn().mockReturnValue("d-test"),
      getSupportEmailAddress: vi.fn().mockReturnValue({
        name: "Dust team",
        email: "support@dust.tt",
      }),
    },
  };
});

vi.spyOn(sgMail, "setApiKey").mockImplementation(() => {});
vi.spyOn(sgMail, "send").mockResolvedValue([
  { statusCode: 202, headers: {}, body: {} },
  {},
] as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sgMail.send).mockResolvedValue([
    { statusCode: 202, headers: {}, body: {} },
    {},
  ] as never);
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
    const { req, res, workspace, auth, globalSpace } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(auth);

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
        auth,
        server1.sId
      );
    expect(systemView1).not.toBeNull();
    await MCPServerViewResource.create(auth, {
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
    const { req, res, workspace, auth, globalSpace, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(auth);

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
        auth,
        server1.sId
      );
    expect(systemView1).not.toBeNull();
    await MCPServerViewResource.create(auth, {
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
    const { req, res, workspace, user, auth, globalSpace, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(auth);

    const regularSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(regularSpace, globalGroup);

    const extraAdmin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, extraAdmin, { role: "admin" });

    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Notion",
    });
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );

    expect(systemView).not.toBeNull();

    const { view: regularView } = await MCPServerViewResource.create(auth, {
      systemView: systemView!,
      space: regularSpace,
    });

    const impactedAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      {
        name: "Needs Reconfiguration",
      }
    );
    await AgentMCPServerConfigurationFactory.create(auth, regularSpace, {
      agent: impactedAgent,
      mcpServerView: regularView,
    });

    const staleAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Stale Agent",
    });
    await AgentMCPServerConfigurationFactory.create(auth, regularSpace, {
      agent: staleAgent,
      mcpServerView: regularView,
    });
    await AgentConfigurationFactory.updateTestAgent(auth, staleAgent.sId, {
      name: "Stale Agent",
    });

    req.query.spaceId = globalSpace.sId;
    req.body = { mcpServerId: server.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const sentMessages = vi
      .mocked(sgMail.send)
      .mock.calls.flatMap(([message]) =>
        Array.isArray(message) ? message : [message]
      )
      .map((message) => message as TemplateEmailMessage);

    expect(sentMessages).toHaveLength(2);
    expect(sentMessages.flatMap((message) => message.to).sort()).toEqual(
      [user.email, extraAdmin.email].sort()
    );
    sentMessages.forEach((message) => {
      expect(message.from).toEqual({
        name: "Dust team",
        email: "support@dust.tt",
      });
      expect(message.templateId).toBe("d-test");
      expect(message.dynamic_template_data.subject).toBe(
        "[Dust] Agents to reconfigure after sharing Notion"
      );
      expect(message.dynamic_template_data.body).toContain(workspace.name);
      expect(message.dynamic_template_data.body).toContain(
        "Needs Reconfiguration"
      );
    });
  });

  it("does not fail the sharing request when the notification email fails", async () => {
    vi.mocked(sgMail.send).mockRejectedValue(new Error("email failed"));

    const { req, res, workspace, auth, globalSpace, globalGroup } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "POST",
      });

    await SpaceFactory.defaults(auth);

    const regularSpace = await SpaceFactory.regular(workspace);
    await GroupSpaceFactory.associate(regularSpace, globalGroup);

    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Notion",
    });
    const systemView =
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        server.sId
      );

    expect(systemView).not.toBeNull();

    const { view: regularView } = await MCPServerViewResource.create(auth, {
      systemView: systemView!,
      space: regularSpace,
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Needs Reconfiguration",
    });
    await AgentMCPServerConfigurationFactory.create(auth, regularSpace, {
      agent,
      mcpServerView: regularView,
    });

    req.query.spaceId = globalSpace.sId;
    req.body = { mcpServerId: server.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().success).toBe(true);
  });
});
