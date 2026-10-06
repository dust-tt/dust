import { getAgentConfigurationAsYAMLConfig } from "@app/lib/api/assistant/configuration/yaml_export";
import { patchAgentConfigurationFromJSON } from "@app/lib/api/assistant/configuration/yaml_import";
import { getEditors } from "@app/lib/api/assistant/editors";
import type { Authenticator } from "@app/lib/auth";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import { toAgentConfigurations } from "@app/lib/resources/agent_resource_serialization";
import type { GroupResource as GroupResourceType } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { saveAgentConfiguration } from "@app/tests/utils/saveAgentConfiguration";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { TemplateFactory } from "@app/tests/utils/TemplateFactory";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { describe, expect, it } from "vitest";

// Serializes a saved agent for assertions on its full configuration.
async function toFullConfiguration(
  auth: Authenticator,
  agent: AgentResource
): Promise<AgentConfigurationType> {
  const [configuration] = await toAgentConfigurations(auth, [agent]);
  return configuration;
}

async function createPatchableAgent({
  auth,
  globalGroup,
}: {
  auth: Authenticator;
  globalGroup: GroupResourceType;
}) {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const space = await SpaceFactory.regular(workspace);
  await SpaceFactory.attachGroup(space, globalGroup);
  // `associate` seeds the space's group_permissions; refresh so this long-lived `auth`'s snapshot
  // picks up the grant (space access is served from the table).
  await auth.refresh();

  const tag = await TagFactory.create(workspace, { name: "yaml-import-test" });
  const template = await TemplateFactory.published();

  const createResult = await saveAgentConfiguration(auth, {
    name: "YAML import test agent",
    description: "Initial description",
    instructions: "Initial instructions",
    instructionsHtml: "<p>Initial instructions</p>",
    pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
    status: "active",
    scope: "hidden",
    model: {
      providerId: "anthropic",
      modelId: "claude-sonnet-5",
      temperature: 0.5,
    },
    agentConfigurationId: undefined,
    templateId: template.sId,
    requestedSpaceIds: [space.id],
    tags: [tag.toJSON()],
    editors: [user.toJSON()],
    authorId: user.id,
  });
  expect(createResult.isOk()).toBe(true);
  if (createResult.isErr()) {
    throw createResult.error;
  }

  const agent = {
    ...createResult.value,
    instructionsHtml: "<p>Initial instructions</p>",
    actions: [],
  } satisfies AgentConfigurationType;

  const server = await RemoteMCPServerFactory.create(workspace, {
    name: "YAML Import Test Server",
  });
  const serverView = await MCPServerViewFactory.create(
    workspace,
    server.sId,
    space
  );
  await AgentMCPServerConfigurationFactory.create(auth, space, {
    agent,
    mcpServerView: serverView,
  });

  const skill = await SkillFactory.create(auth, {
    name: "YAML Import Test Skill",
  });
  await SkillFactory.linkToAgent(auth, {
    skillId: skill.id,
    agentConfigurationId: agent.id,
  });

  const agentForPatch = await AgentConfigurationFactory.refetch(
    auth,
    agent.sId
  );
  if (!agentForPatch) {
    throw new Error("Agent not found");
  }

  return {
    agent: agentForPatch,
    agentContent: await agentForPatch.fetchInstructions(),
    skill,
    space,
    tag,
    template,
    user,
  };
}

async function getEditorIds(
  auth: Authenticator,
  agent: AgentConfigurationType
) {
  return (await getEditors(auth, agent)).map((editor) => editor.sId);
}

describe("patchAgentConfigurationFromJSON", () => {
  it("should preserve existing state when applying a description-only YAML patch", async () => {
    const { authenticator, globalGroup } = await createResourceTest({
      role: "admin",
    });
    const { agent, agentContent, skill, space, tag, template, user } =
      await createPatchableAgent({ auth: authenticator, globalGroup });

    const result = await patchAgentConfigurationFromJSON(
      authenticator,
      agent.sId,
      {
        agent: {
          description: "Updated description",
        },
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.api_error.message);
    }

    const updatedAgent = await toFullConfiguration(
      authenticator,
      result.value.agent
    );
    expect(updatedAgent.description).toBe("Updated description");
    expect(updatedAgent.name).toBe(agent.name);
    expect(updatedAgent.instructions).toBe(agentContent.instructions);
    expect(updatedAgent.instructionsHtml).toBe(agentContent.instructionsHtml);
    expect(updatedAgent.templateId).toBe(template.sId);
    expect(updatedAgent.requestedSpaceIds).toContain(space.sId);
    expect(updatedAgent.tags.map((t) => t.sId)).toContain(tag.sId);
    await expect(
      SkillResource.listByAgentConfiguration(authenticator, updatedAgent).then(
        (skills) => skills.map((s) => s.sId)
      )
    ).resolves.toContain(skill.sId);
    expect(updatedAgent.actions).toHaveLength(1);

    await expect(getEditorIds(authenticator, updatedAgent)).resolves.toContain(
      user.sId
    );
  });

  it("should replace actions and report skipped actions when patching toolset", async () => {
    const { authenticator, globalGroup } = await createResourceTest({
      role: "admin",
    });
    const { agent, space } = await createPatchableAgent({
      auth: authenticator,
      globalGroup,
    });

    const result = await patchAgentConfigurationFromJSON(
      authenticator,
      agent.sId,
      {
        toolset: [
          {
            name: "Missing MCP server",
            description: "Should be skipped",
            type: "MCP",
            configuration: {
              mcp_server_name: "missing_server",
            },
          },
        ],
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.api_error.message);
    }

    expect(result.value.skippedActions).toEqual([
      {
        name: "Missing MCP server",
        reason: "MCP server not found: missing_server",
      },
    ]);
    expect(
      (await toFullConfiguration(authenticator, result.value.agent)).actions
    ).toHaveLength(0);
    expect(
      (await toFullConfiguration(authenticator, result.value.agent))
        .requestedSpaceIds
    ).not.toContain(space.sId);
  });

  it("should attach a remote MCP server referenced by name when patching toolset", async () => {
    const { authenticator, globalGroup } = await createResourceTest({
      role: "admin",
    });
    const { agent, space } = await createPatchableAgent({
      auth: authenticator,
      globalGroup,
    });

    const result = await patchAgentConfigurationFromJSON(
      authenticator,
      agent.sId,
      {
        toolset: [
          {
            name: "Remote tool",
            description: "A remote MCP server attached by name",
            type: "MCP",
            configuration: {
              mcp_server_name: "YAML Import Test Server",
            },
          },
        ],
        spaces: [
          {
            space_id: space.sId,
            name: space.name,
          },
        ],
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.api_error.message);
    }

    expect(result.value.skippedActions).toEqual([]);
    expect(
      (await toFullConfiguration(authenticator, result.value.agent)).actions
    ).toHaveLength(1);
    expect(
      (await toFullConfiguration(authenticator, result.value.agent))
        .requestedSpaceIds
    ).toContain(space.sId);
  });

  it("should skip a remote MCP server that is only present in the system space", async () => {
    const { authenticator, globalGroup } = await createResourceTest({
      role: "admin",
    });
    const { agent } = await createPatchableAgent({
      auth: authenticator,
      globalGroup,
    });

    const workspace = authenticator.getNonNullableWorkspace();
    // Never shared to a space, so only its system-space view exists — not attachable.
    await RemoteMCPServerFactory.create(workspace, {
      name: "System Only Server",
    });

    const result = await patchAgentConfigurationFromJSON(
      authenticator,
      agent.sId,
      {
        toolset: [
          {
            name: "Unshared remote tool",
            description: "Should be skipped",
            type: "MCP",
            configuration: {
              mcp_server_name: "System Only Server",
            },
          },
        ],
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.api_error.message);
    }

    expect(result.value.skippedActions).toEqual([
      {
        name: "Unshared remote tool",
        reason: "MCP server not found: System Only Server",
      },
    ]);
    expect(
      (await toFullConfiguration(authenticator, result.value.agent)).actions
    ).toHaveLength(0);
  });

  it("should skip a remote MCP server name that resolves to several servers", async () => {
    const { authenticator, globalGroup } = await createResourceTest({
      role: "admin",
    });
    const { agent, space } = await createPatchableAgent({
      auth: authenticator,
      globalGroup,
    });

    const workspace = authenticator.getNonNullableWorkspace();
    // Two distinct remote servers sharing a display name, both shared to an accessible space.
    for (let i = 0; i < 2; i++) {
      const server = await RemoteMCPServerFactory.create(workspace, {
        name: "Duplicate Server",
      });
      await MCPServerViewFactory.create(workspace, server.sId, space);
    }

    const result = await patchAgentConfigurationFromJSON(
      authenticator,
      agent.sId,
      {
        toolset: [
          {
            name: "Ambiguous remote tool",
            description: "Should be skipped",
            type: "MCP",
            configuration: {
              mcp_server_name: "Duplicate Server",
            },
          },
        ],
        spaces: [
          {
            space_id: space.sId,
            name: space.name,
          },
        ],
      }
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.api_error.message);
    }

    expect(result.value.skippedActions).toEqual([
      {
        name: "Ambiguous remote tool",
        reason:
          'Multiple MCP servers named "Duplicate Server" found; cannot resolve unambiguously.',
      },
    ]);
    expect(
      (await toFullConfiguration(authenticator, result.value.agent)).actions
    ).toHaveLength(0);
  });

  it("should export the view's custom display name and re-import it without skipping the action", async () => {
    const { authenticator, globalGroup } = await createResourceTest({
      role: "admin",
    });
    const workspace = authenticator.getNonNullableWorkspace();
    const user = authenticator.getNonNullableUser();

    const space = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(space, globalGroup);
    await authenticator.refresh();

    const createResult = await saveAgentConfiguration(authenticator, {
      name: "YAML export test agent",
      description: "Initial description",
      instructions: "Initial instructions",
      instructionsHtml: "<p>Initial instructions</p>",
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-5",
        temperature: 0.5,
      },
      agentConfigurationId: undefined,
      templateId: null,
      requestedSpaceIds: [space.id],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });
    expect(createResult.isOk()).toBe(true);
    if (createResult.isErr()) {
      throw createResult.error;
    }

    const agent = {
      ...createResult.value,
      instructionsHtml: "<p>Initial instructions</p>",
      actions: [],
    } satisfies AgentConfigurationType;

    // Server's own name is slug-like; the view carries an admin-set display name that
    // differs from it, mirroring a remote MCP server whose slug and display name diverge.
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "ulule-mcp",
    });
    const serverView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      space
    );
    const renameResult = await serverView.updateNameAndDescription(
      authenticator,
      "Ulule MCP Prod"
    );
    expect(renameResult.isOk()).toBe(true);

    await AgentMCPServerConfigurationFactory.create(authenticator, space, {
      agent,
      mcpServerView: serverView,
    });

    const yamlConfigResult = await getAgentConfigurationAsYAMLConfig(
      authenticator,
      agent.sId
    );
    expect(yamlConfigResult.isOk()).toBe(true);
    if (yamlConfigResult.isErr()) {
      throw new Error(yamlConfigResult.error.api_error.message);
    }

    expect(yamlConfigResult.value.toolset).toHaveLength(1);
    expect(
      yamlConfigResult.value.toolset[0].configuration.mcp_server_name
    ).toBe("Ulule MCP Prod");

    const patchResult = await patchAgentConfigurationFromJSON(
      authenticator,
      agent.sId,
      {
        toolset: yamlConfigResult.value.toolset,
        spaces: yamlConfigResult.value.spaces,
      }
    );

    expect(patchResult.isOk()).toBe(true);
    if (patchResult.isErr()) {
      throw new Error(patchResult.error.api_error.message);
    }

    expect(patchResult.value.skippedActions).toEqual([]);
    expect(
      (await toFullConfiguration(authenticator, patchResult.value.agent))
        .actions
    ).toHaveLength(1);
  });
});
