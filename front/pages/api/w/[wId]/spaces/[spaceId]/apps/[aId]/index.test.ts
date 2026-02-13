import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AppResource } from "@app/lib/resources/app_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { describe, expect, it } from "vitest";

import handler from "./index";

describe("DELETE /api/w/[wId]/spaces/[spaceId]/apps/[aId]", () => {
  it("returns 409 when the app is used by an active agent", async () => {
    const { req, res, workspace, user, globalSpace, authenticator } =
      await createPrivateApiMockRequest({
        method: "DELETE",
        role: "admin",
      });

    const app = await AppResource.makeNew(
      {
        description: "Test app",
        dustAPIProjectId: "dust-api-project-id",
        name: "Test App",
        savedConfig: "{}",
        savedSpecification: "[]",
        sId: generateRandomModelSId(),
        visibility: "private",
        workspaceId: workspace.id,
      },
      globalSpace
    );

    const agent = await AgentConfigurationModel.create({
      sId: generateRandomModelSId(),
      version: 0,
      status: "active",
      scope: "visible",
      name: "Agent using app",
      description: "Agent description",
      instructions: null,
      instructionsHtml: null,
      providerId: "openai",
      modelId: "gpt-4-turbo",
      temperature: 0.7,
      reasoningEffort: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      workspaceId: workspace.id,
      authorId: user.id,
      templateId: null,
      requestedSpaceIds: [],
      maxStepsPerRun: 8,
    });

    const internalMCPServerId = autoInternalMCPServerNameToSId({
      name: "search",
      workspaceId: workspace.id,
    });

    const mcpServerView = await MCPServerViewModel.create({
      workspaceId: workspace.id,
      vaultId: globalSpace.id,
      editedAt: new Date(),
      editedByUserId: user.id,
      serverType: "internal",
      internalMCPServerId,
      remoteMCPServerId: null,
      name: null,
      description: null,
      oAuthUseCase: null,
    });

    await AgentMCPServerConfigurationModel.create({
      sId: generateRandomModelSId(),
      agentConfigurationId: agent.id,
      workspaceId: workspace.id,
      mcpServerViewId: mcpServerView.id,
      internalMCPServerId,
      additionalConfiguration: {},
      timeFrame: null,
      jsonSchema: null,
      name: null,
      singleToolDescriptionOverride: null,
      appId: app.sId,
      secretName: null,
    });

    req.query = {
      ...req.query,
      wId: workspace.sId,
      spaceId: globalSpace.sId,
      aId: app.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(409);
    const data = res._getJSONData();
    expect(data).toHaveProperty("error");
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toContain("Cannot delete app in use by");
    expect(data.error.message).toContain(agent.name);

    const stillThere = await AppResource.fetchById(authenticator, app.sId);
    expect(stillThere).not.toBeNull();
  });

  it("returns 204 and deletes the app when it is unused", async () => {
    const { req, res, workspace, globalSpace, authenticator } =
      await createPrivateApiMockRequest({
        method: "DELETE",
        role: "admin",
      });

    const app = await AppResource.makeNew(
      {
        description: "Test app",
        dustAPIProjectId: "dust-api-project-id",
        name: "Test App",
        savedConfig: "{}",
        savedSpecification: "[]",
        sId: generateRandomModelSId(),
        visibility: "private",
        workspaceId: workspace.id,
      },
      globalSpace
    );

    req.query = {
      ...req.query,
      wId: workspace.sId,
      spaceId: globalSpace.sId,
      aId: app.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(204);
    const deleted = await AppResource.fetchById(authenticator, app.sId);
    expect(deleted).toBeNull();
  });
});
