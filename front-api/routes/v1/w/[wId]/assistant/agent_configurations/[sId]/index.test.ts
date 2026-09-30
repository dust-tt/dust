import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setupTest(role: "admin" | "user" = "admin") {
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

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);

  return { workspace, key, agentConfig, auth, user };
}

function getAgentConfiguration(
  workspace: { sId: string },
  key: { secret: string },
  agentId: string,
  { variant }: { variant?: "light" | "full" } = {}
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/assistant/agent_configurations/${agentId}${
      variant ? `?variant=${variant}` : ""
    }`,
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

  it("returns the skills attached to the agent", async () => {
    const { workspace, key, agentConfig, auth } = await setupTest("admin");
    const skill = await SkillFactory.create(auth, {
      name: "Support Playbook",
    });
    await SkillFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agentConfig.id,
    });

    const response = await getAgentConfiguration(
      workspace,
      key,
      agentConfig.sId
    );
    const data = await response.json();

    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(data.agentConfiguration.skills).toEqual([
      { sId: skill.sId, name: "Support Playbook" },
    ]);
  });

  it("returns an empty skills array for an agent without skills", async () => {
    const { workspace, key, agentConfig } = await setupTest("admin");

    const response = await getAgentConfiguration(
      workspace,
      key,
      agentConfig.sId
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.agentConfiguration.skills).toEqual([]);
  });

  it.each([
    "admin",
    "user",
  ] as const)("reports edit permissions for a %s key on a published agent", async (role) => {
    const { workspace, key, agentConfig } = await setupTest(role);
    const response = await getAgentConfiguration(
      workspace,
      key,
      agentConfig.sId
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.agentConfiguration.canEdit).toBe(role === "admin");

    const patchResponse = await patchAgentConfiguration(
      workspace,
      key,
      agentConfig.sId,
      { instructions: "Updated through the API" }
    );
    expect(patchResponse.status).toBe(role === "admin" ? 200 : 403);
  });

  it.each([
    "admin",
    "user",
  ] as const)("only allows an admin key to access an unpublished agent (%s)", async (role) => {
    const { workspace, key, auth } = await setupTest(role);
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Unpublished Agent",
      scope: "hidden",
    });
    const response = await getAgentConfiguration(workspace, key, agent.sId);
    const data = await response.json();

    if (role === "admin") {
      expect(response.status).toBe(200);
      expect(data.agentConfiguration.canRead).toBe(false);
      expect(data.agentConfiguration.canEdit).toBe(true);
    } else {
      // A regular key holds no permission on a hidden agent: it cannot fetch it.
      expect(response.status).toBe(404);
      expect(data.error.type).toBe("agent_configuration_not_found");
    }

    const patchResponse = await patchAgentConfiguration(
      workspace,
      key,
      agent.sId,
      {
        instructions: "Updated through the API",
      }
    );
    expect(patchResponse.status).toBe(role === "admin" ? 200 : 403);
  });

  it.each([
    "draft",
    "pending",
  ] as const)("keeps a legacy visible %s private from regular keys", async (status) => {
    const { workspace, key, auth } = await setupTest("user");
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: `Legacy ${status}`,
      scope: "visible",
    });
    await AgentConfigurationModel.update(
      { status },
      { where: { id: agent.id } }
    );

    const response = await getAgentConfiguration(workspace, key, agent.sId);
    const data = await response.json();

    // Draft and pending agents are authorized as hidden: a regular key cannot fetch them.
    expect(response.status, JSON.stringify(data)).toBe(404);
    expect(data.error.type).toBe("agent_configuration_not_found");
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

  it("redacts the private fields of the full variant from a caller who cannot view the content", async () => {
    const { workspace, key, auth } = await setupTest("admin");
    const hidden = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Hidden agent",
      scope: "hidden",
      instructions: "Private instructions",
    });

    const response = await getAgentConfiguration(workspace, key, hidden.sId, {
      variant: "full",
    });
    const data = await response.json();

    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(data.agentConfiguration.canRead).toBe(false);
    expect(data.agentConfiguration.instructions).toBeNull();
    expect(data.agentConfiguration.instructionsHtml).toBeNull();
    expect(data.agentConfiguration.actions).toEqual([]);
  });

  it("returns the private fields of the full variant to an admin allowed to view private agents", async () => {
    const { workspace, key, auth } = await setupTest("admin");
    await FeatureFlagFactory.basic(auth, "admin_can_see_private_entities");
    const hidden = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Hidden agent",
      scope: "hidden",
      instructions: "Private instructions",
    });

    const response = await getAgentConfiguration(workspace, key, hidden.sId, {
      variant: "full",
    });
    const data = await response.json();

    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(data.agentConfiguration.instructions).toBe("Private instructions");
  });

  it("returns the private fields of the full variant to a reader", async () => {
    const { workspace, key, agentConfig } = await setupTest("admin");

    const response = await getAgentConfiguration(
      workspace,
      key,
      agentConfig.sId,
      { variant: "full" }
    );
    const data = await response.json();

    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(data.agentConfiguration.canRead).toBe(true);
    expect(data.agentConfiguration.instructions).toBe(agentConfig.instructions);
  });

  it("returns 404 for a retired global agent (e.g. gpt-4)", async () => {
    const { workspace, key } = await setupTest("user");

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

  it("redacts the patched configuration from a caller who cannot view the content", async () => {
    const { workspace, key, auth } = await setupTest("admin");
    const hidden = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Hidden agent",
      scope: "hidden",
      instructions: "Private instructions",
    });

    const response = await patchAgentConfiguration(workspace, key, hidden.sId, {
      instructions: "Updated through the API",
    });
    const data = await response.json();

    expect(response.status, JSON.stringify(data)).toBe(200);
    expect(data.agentConfiguration.canRead).toBe(false);
    expect(data.agentConfiguration.instructions).toBeNull();
    expect(data.agentConfiguration.instructionsHtml).toBeNull();
    expect(data.agentConfiguration.actions).toEqual([]);
  });

  it("applies an admin key's patch to a hidden agent it cannot read (tasks#10680)", async () => {
    const { workspace, key, auth } = await setupTest("admin");
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Hidden Agent",
      scope: "hidden",
    });
    const skill = await SkillFactory.create(auth, { name: "Support Playbook" });

    const response = await patchAgentConfiguration(workspace, key, agent.sId, {
      instructions: "Updated through the API",
      skills: [{ sId: skill.sId, name: skill.name }],
    });
    expect(response.status, JSON.stringify(await response.json())).toBe(200);

    const updated = await AgentResource.fetchById(auth, agent.sId);
    expect(updated?.version).toBe(agent.version + 1);
    expect((await updated?.fetchInstructions())?.instructions).toBe(
      "Updated through the API"
    );
    const skills = await updated?.listSkills(auth);
    expect(skills?.map((s) => s.sId)).toEqual([skill.sId]);
  });

  it("returns 404 when the agent configuration does not exist", async () => {
    const { workspace, key } = await setupTest();

    const response = await patchAgentConfiguration(workspace, key, "unknown", {
      instructions: "Updated instructions",
    });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/v1/w/[wId]/assistant/agent_configurations/[sId]", () => {
  it("lets an admin key archive an agent built on a space its groups do not cover", async () => {
    const { workspace, key, auth, user } = await setupTest();
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(internalAdminAuth, {
      userIds: [user.sId],
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Restricted Agent",
      requestedSpaceIds: [restrictedSpace.id],
    });

    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/assistant/agent_configurations/${agent.sId}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${key.secret}` },
      }
    );

    expect(response.status).toBe(200);
    const archived = await AgentResource.fetchById(
      internalAdminAuth,
      agent.sId
    );
    expect(archived?.status).toBe("archived");
  });
});
