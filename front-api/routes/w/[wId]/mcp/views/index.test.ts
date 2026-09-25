import type { MCPServerViewType } from "@app/lib/api/mcp";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

const plainInputSchema: JSONSchema = {
  type: "object",
  properties: { query: { type: "string" } },
  required: ["query"],
};

describe("GET /api/w/:wId/mcp/views", () => {
  it("returns views with the full serialization", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "user",
    });

    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Plain Server",
      url: "https://plain-server.example.com",
      tools: [
        {
          name: "search",
          description: "Search things",
          inputSchema: plainInputSchema,
        },
      ],
    });
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );

    const baseUrl = `/api/w/${workspace.sId}/mcp/views`;
    const queryParams = new URLSearchParams({
      spaceIds: globalSpace.sId,
      availabilities: "manual,auto",
    });
    const url = `${baseUrl}?${queryParams.toString()}`;
    const response = await honoApp.request(url);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const serverViews: MCPServerViewType[] = body.serverViews;
    const serverView = serverViews.find((v) => v.server.sId === server.sId);

    expect(serverView).toBeDefined();

    // Full serialization: tool input schemas and remote server specifics are present.
    expect(serverView?.server.tools[0].inputSchema).toEqual(plainInputSchema);
    expect(serverView?.server).toHaveProperty("url");
    expect(serverView?.server).toHaveProperty("sharedSecret");

    await MCPServerViewModel.update(
      { isRestrictedToSkills: true },
      { where: { id: view.id } }
    );

    const defaultResponse = await honoApp.request(url);
    const defaultBody = await defaultResponse.json();
    expect(
      defaultBody.serverViews.some((v: MCPServerViewType) => v.sId === view.sId)
    ).toBe(false);

    queryParams.set("includeRestrictedToSkills", "true");
    const skillBuilderUrl = `${baseUrl}?${queryParams.toString()}`;
    const skillBuilderResponse = await honoApp.request(skillBuilderUrl);
    const skillBuilderBody = await skillBuilderResponse.json();
    const skillBuilderView = skillBuilderBody.serverViews.find(
      (v: MCPServerViewType) => v.sId === view.sId
    );
    expect(skillBuilderView).toBeDefined();
    expect(skillBuilderView.isRestrictedToSkills).toBe(true);
  });

  it("defaults to the spaces the user is a member of when spaceIds is omitted", async () => {
    const { workspace, user, globalSpace } = await createPrivateApiMockRequest({
      role: "user",
    });

    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );

    const memberSpace = await SpaceFactory.regular(workspace);
    const addMembersRes = await memberSpace.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }
    const otherSpace = await SpaceFactory.regular(workspace);

    const server = await RemoteMCPServerFactory.create(workspace);
    const globalView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const memberView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      memberSpace
    );
    const otherView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      otherSpace
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/mcp/views?availabilities=manual,auto`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const viewIds = body.serverViews.map((v: MCPServerViewType) => v.sId);
    expect(viewIds).toContain(globalView.sId);
    expect(viewIds).toContain(memberView.sId);
    expect(viewIds).not.toContain(otherView.sId);
  });

  it("returns 400 when spaceIds is empty", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/mcp/views?spaceIds=&availabilities=manual,auto`
    );

    expect(response.status).toBe(400);
  });
});
