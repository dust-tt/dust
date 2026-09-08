import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest({
  role = "builder",
  scope = "visible",
}: {
  role?: "user" | "builder" | "admin";
  scope?: "visible" | "hidden";
} = {}) {
  const { workspace, key } = await createPublicApiMockRequest({ role });

  await SpaceFactory.defaults(
    await Authenticator.internalAdminForWorkspace(workspace.sId)
  );

  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
    scope,
  });

  return { workspace, key, agentConfig };
}

function getAgentConfiguration(
  workspace: { sId: string },
  key: { secret: string },
  agentId: string
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/assistant/agent_configurations/${agentId}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${key.secret}`,
      },
    }
  );
}

function patchAgentConfiguration(
  workspace: { sId: string },
  key: { secret: string },
  agentId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/assistant/agent_configurations/${agentId}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${key.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

describe("GET /api/v1/w/[wId]/assistant/agent_configurations/[sId]", () => {
  it("returns 404 for a retired global agent (e.g. gpt-4)", async () => {
    const { workspace, key } = await setupTest();

    const response = await getAgentConfiguration(workspace, key, "gpt-4");

    expect(response.status).toBe(404);
  });

  it("returns a published (visible) agent to a non-admin key", async () => {
    const { workspace, key, agentConfig } = await setupTest({
      role: "builder",
      scope: "visible",
    });

    const response = await getAgentConfiguration(
      workspace,
      key,
      agentConfig.sId
    );

    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(data.agentConfiguration.sId).toBe(agentConfig.sId);
  });

  it("returns 403 for an unpublished (hidden) agent to a non-admin key", async () => {
    const { workspace, key, agentConfig } = await setupTest({
      role: "builder",
      scope: "hidden",
    });

    const response = await getAgentConfiguration(
      workspace,
      key,
      agentConfig.sId
    );

    expect(response.status).toBe(403);
  });

  it("returns an unpublished (hidden) agent to an admin key", async () => {
    const { workspace, key, agentConfig } = await setupTest({
      role: "admin",
      scope: "hidden",
    });

    const response = await getAgentConfiguration(
      workspace,
      key,
      agentConfig.sId
    );

    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(data.agentConfiguration.sId).toBe(agentConfig.sId);
  });
});

describe("PATCH /api/v1/w/[wId]/assistant/agent_configurations/[sId]", () => {
  it("applies configuration patch fields beyond userFavorite (regression dust-tt/dust#26698)", async () => {
    const { workspace, key, agentConfig } = await setupTest({ role: "admin" });

    const response = await patchAgentConfiguration(
      workspace,
      key,
      agentConfig.sId,
      { instructions: "Updated instructions" }
    );

    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(data.agentConfiguration.instructions).toBe("Updated instructions");
    expect(data.agentConfiguration.version).toBe(agentConfig.version + 1);
  });

  it("returns 404 when the agent configuration does not exist", async () => {
    const { workspace, key } = await setupTest({ role: "admin" });

    const response = await patchAgentConfiguration(workspace, key, "unknown", {
      instructions: "Updated instructions",
    });

    expect(response.status).toBe(404);
  });
});
