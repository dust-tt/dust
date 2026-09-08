import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest(role: "admin" | "builder" | "user" = "builder") {
  const { workspace, key } = await createPublicApiMockRequest({ role });

  await SpaceFactory.defaults(
    await Authenticator.internalAdminForWorkspace(workspace.sId)
  );

  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "builder" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);

  return { workspace, key, agentConfig, auth, user };
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
  it("keeps an agent created and edited with an admin key editable on subsequent reads", async () => {
    const { workspace, key, user } = await setupTest("admin");
    const imported = await honoApp.request(
      `/api/v1/w/${workspace.sId}/assistant/agent_configurations/import`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${key.secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          agent: {
            handle: "API-created agent",
            description: "Created through the API",
            scope: "visible",
            avatar_url: "https://dust.tt/static/systemavatar/test_avatar_1.png",
            max_steps_per_run: 8,
            visualization_enabled: false,
          },
          instructions: "Initial instructions",
          generation_settings: {
            model_id: "gpt-5-mini",
            provider_id: "openai",
            temperature: 0.7,
            reasoning_effort: "medium",
          },
          tags: [],
          editors: [user.email],
          toolset: [],
        }),
      }
    );
    const importedData = await imported.json();
    expect(imported.status, JSON.stringify(importedData)).toBe(200);
    const agentId = importedData.agentConfiguration.sId;

    const patched = await patchAgentConfiguration(workspace, key, agentId, {
      instructions: "Updated instructions",
    });
    expect(patched.status).toBe(200);

    const response = await getAgentConfiguration(workspace, key, agentId);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.agentConfiguration.canEdit).toBe(true);
    expect(data.agentConfiguration.instructions).toBe("Updated instructions");
  });

  it.each([
    "admin",
    "builder",
    "user",
  ] as const)("reports whether a %s key can patch a published agent", async (role) => {
    const { workspace, key, agentConfig } = await setupTest(role);
    const response = await getAgentConfiguration(
      workspace,
      key,
      agentConfig.sId
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.agentConfiguration.canEdit).toBe(role !== "user");

    const patchResponse = await patchAgentConfiguration(
      workspace,
      key,
      agentConfig.sId,
      { instructions: "Updated through the API" }
    );
    expect(patchResponse.status).toBe(role === "user" ? 403 : 200);
  });

  it.each([
    "admin",
    "builder",
  ] as const)("reports whether a %s key can patch an unpublished agent", async (role) => {
    const { workspace, key, auth } = await setupTest(role);
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Unpublished Agent",
      scope: "hidden",
    });
    const response = await getAgentConfiguration(workspace, key, agent.sId);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.agentConfiguration.canEdit).toBe(role === "admin");

    const patchResponse = await patchAgentConfiguration(
      workspace,
      key,
      agent.sId,
      {
        instructions: "Updated through the API",
      }
    );
    expect(patchResponse.status).toBe(role === "admin" ? 200 : 404);
  });

  it("does not report global or archived agents as editable with an admin key", async () => {
    const { workspace, key, agentConfig } = await setupTest("admin");
    const archiveResponse = await honoApp.request(
      `/api/v1/w/${workspace.sId}/assistant/agent_configurations/${agentConfig.sId}`,
      { method: "DELETE", headers: { authorization: `Bearer ${key.secret}` } }
    );
    expect(archiveResponse.status).toBe(200);

    for (const agentId of ["dust", agentConfig.sId]) {
      const response = await getAgentConfiguration(workspace, key, agentId);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.agentConfiguration.canEdit).toBe(false);

      const patchResponse = await patchAgentConfiguration(
        workspace,
        key,
        agentId,
        {
          instructions: "Updated through the API",
        }
      );
      expect(patchResponse.status).toBe(400);
    }
  });

  it("returns 404 for a retired global agent (e.g. gpt-4)", async () => {
    const { workspace, key } = await setupTest();

    const response = await getAgentConfiguration(workspace, key, "gpt-4");

    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/v1/w/[wId]/assistant/agent_configurations/[sId]", () => {
  it("applies configuration patch fields beyond userFavorite (regression dust-tt/dust#26698)", async () => {
    const { workspace, key, agentConfig } = await setupTest();

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
    const { workspace, key } = await setupTest();

    const response = await patchAgentConfiguration(workspace, key, "unknown", {
      instructions: "Updated instructions",
    });

    expect(response.status).toBe(404);
  });
});
