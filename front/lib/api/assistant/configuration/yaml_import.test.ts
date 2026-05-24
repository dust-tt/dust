import { createAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getExportableAgentConfiguration } from "@app/lib/api/assistant/configuration/yaml_export";
import { patchAgentConfigurationFromJSON } from "@app/lib/api/assistant/configuration/yaml_import";
import type { Authenticator } from "@app/lib/auth";
import type { GroupResource as GroupResourceType } from "@app/lib/resources/group_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { TemplateFactory } from "@app/tests/utils/TemplateFactory";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { describe, expect, it } from "vitest";

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
  await GroupSpaceFactory.associate(space, globalGroup);

  const tag = await TagFactory.create(workspace, { name: "yaml-import-test" });
  const template = await TemplateFactory.published();

  const createResult = await createAgentConfiguration(auth, {
    name: "YAML import test agent",
    description: "Initial description",
    instructions: "Initial instructions",
    instructionsHtml: "<p>Initial instructions</p>",
    pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
    status: "active",
    scope: "hidden",
    model: {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5-20250929",
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

  const agentForPatch = await getExportableAgentConfiguration(auth, agent.sId);
  expect(agentForPatch.isOk()).toBe(true);
  if (agentForPatch.isErr()) {
    throw new Error(agentForPatch.error.api_error.message);
  }

  return {
    agent: agentForPatch.value,
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
  const editorGroupResult = await GroupResource.findEditorGroupForAgent(
    auth,
    agent
  );
  expect(editorGroupResult.isOk()).toBe(true);
  if (editorGroupResult.isErr()) {
    throw editorGroupResult.error;
  }

  const editors = await editorGroupResult.value.getActiveMembers(auth);

  return editors.map((editor) => editor.sId);
}

describe("patchAgentConfigurationFromJSON", () => {
  it("should preserve existing state when applying a description-only YAML patch", async () => {
    const { authenticator, globalGroup } = await createResourceTest({
      role: "admin",
    });
    const { agent, skill, space, tag, template, user } =
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

    const updatedAgent = result.value.agentConfiguration;
    expect(updatedAgent.description).toBe("Updated description");
    expect(updatedAgent.name).toBe(agent.name);
    expect(updatedAgent.instructions).toBe(agent.instructions);
    expect(updatedAgent.instructionsHtml).toBe(agent.instructionsHtml);
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
        reason: "Invalid internal MCP server name: missing_server",
      },
    ]);
    expect(result.value.agentConfiguration.actions).toHaveLength(0);
    expect(result.value.agentConfiguration.requestedSpaceIds).not.toContain(
      space.sId
    );
  });
});
