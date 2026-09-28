import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { applyBatchSuggestions } from "@app/lib/api/assistant/apply_batch_suggestions";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { serializeSkillTag } from "@app/lib/skills/format";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { BatchSuggestionFactory } from "@app/tests/utils/BatchSuggestionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { setupSkillInstructionsMarkdownPipeline } from "@app/tests/utils/skill_instructions_html";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { WorkspaceType } from "@app/types/user";
import assert from "assert";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

beforeAll(() => {
  setupSkillInstructionsMarkdownPipeline();
});

describe("applyBatchSuggestions", () => {
  let auth: Authenticator;
  let user: UserResource;
  let workspace: WorkspaceType;
  let globalSpace: SpaceResource;

  beforeEach(async () => {
    ({
      authenticator: auth,
      user,
      workspace,
      globalSpace,
    } = await createResourceTest({
      role: "user",
    }));
  });

  async function fetchAgentToolIds(agentId: string) {
    const agent = await getAgentConfiguration(auth, {
      agentId,
      variant: "full",
    });
    return (agent?.actions ?? [])
      .filter(isServerSideMCPServerConfiguration)
      .map((action) => action.mcpServerViewId);
  }
  async function fetchBatch(batchId: string) {
    const batch = await BatchSuggestionResource.fetchById(auth, batchId);
    assert(batch);
    return batch;
  }

  async function fetchAgentSkillIds(agentId: string) {
    const agent = await getAgentConfiguration(auth, {
      agentId,
      variant: "full",
    });
    assert(agent);
    const skills = await SkillResource.listByAgentConfiguration(auth, agent);
    return skills.map((skill) => skill.sId);
  }

  async function fetchAgentName(agentId: string) {
    const agent = await getAgentConfiguration(auth, {
      agentId,
      variant: "light",
    });
    return agent?.name;
  }

  it("applies the agent suggestions", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isOk()).toBe(true);
    expect(await fetchAgentName(agent.sId)).toBe("RenamedAgent");
  });

  async function fetchSkillName(skillId: string) {
    const skill = await SkillResource.fetchById(auth, skillId);
    return skill?.name;
  }

  it("applies the agent and skill suggestions", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const skill = await SkillFactory.create(auth);
    await auth.refresh();
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    await SkillSuggestionFactory.create(auth, skill, {
      kind: "name",
      suggestion: { name: "RenamedSkill" },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isOk()).toBe(true);
    expect(await fetchAgentName(agent.sId)).toBe("RenamedAgent");
    expect(await fetchSkillName(skill.sId)).toBe("RenamedSkill");
  });

  it("writes nothing when the batch holds several actions on the same agent", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    await AgentSuggestionFactory.createDelete(auth, agent, { batchModelId });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isErr()).toBe(true);
    expect(await fetchAgentName(agent.sId)).toBe(agent.name);
  });

  it("writes nothing when the caller cannot apply a later step", async () => {
    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );
    const adminAgent = await AgentConfigurationFactory.createTestAgent(
      adminAuth,
      { name: "Admin Agent" }
    );
    // The admin is not an editor of this agent: holding only its `admin` verb, they can see its
    // suggestions but not rename it.
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      scope: "visible",
    });
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(adminAuth);
    await AgentSuggestionFactory.createName(adminAuth, adminAgent, {
      suggestion: { name: "RenamedAdminAgent" },
      batchModelId,
    });
    await AgentSuggestionFactory.createName(adminAuth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    const batch = await BatchSuggestionResource.fetchById(adminAuth, sId);
    assert(batch);

    const res = await applyBatchSuggestions(adminAuth, batch);

    assert(res.isErr());
    expect(res.error.code).toBe("unauthorized");
    expect(await fetchAgentName(adminAgent.sId)).toBe(adminAgent.name);
    expect(await fetchAgentName(agent.sId)).toBe(agent.name);
  });

  it("writes nothing when the caller cannot publish an agent of the batch", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const publishedAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "Published Agent", scope: "visible" }
    );
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    await AgentSuggestionFactory.createScope(auth, publishedAgent, {
      suggestion: { scope: "hidden" },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    assert(res.isErr());
    expect(res.error.code).toBe("unauthorized");
    expect(await fetchAgentName(agent.sId)).toBe(agent.name);
  });

  it("writes nothing when the caller cannot apply a skill step", async () => {
    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );
    const adminAgent = await AgentConfigurationFactory.createTestAgent(
      adminAuth,
      { name: "Admin Agent" }
    );
    // The admin is not an editor of this skill: holding only its `admin` verb, they cannot edit its
    // content.
    const skill = await SkillFactory.create(auth);
    await auth.refresh();
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(adminAuth);
    await AgentSuggestionFactory.createName(adminAuth, adminAgent, {
      suggestion: { name: "RenamedAdminAgent" },
      batchModelId,
    });
    // Only an editor can suggest an edit of the skill.
    await SkillSuggestionFactory.create(auth, skill, { batchModelId });
    const batch = await BatchSuggestionResource.fetchById(adminAuth, sId);
    assert(batch);

    const res = await applyBatchSuggestions(adminAuth, batch);

    assert(res.isErr());
    expect(res.error.code).toBe("unauthorized");
    expect(await fetchAgentName(adminAgent.sId)).toBe(adminAgent.name);
  });

  it("writes nothing when a later step fails validation", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const deletedAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Deleted Agent",
    });
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    // Deletions come after edits, so the rename would be written first without the upfront check.
    await AgentSuggestionFactory.createDelete(auth, deletedAgent, {
      batchModelId,
    });
    const batch = await fetchBatch(sId);

    const deletedAgentResource = await AgentResource.fetchById(
      auth,
      deletedAgent.sId
    );
    assert(deletedAgentResource);
    await deletedAgentResource.archive(auth);

    const res = await applyBatchSuggestions(auth, batch);

    expect(res.isErr()).toBe(true);
    expect(await fetchAgentName(agent.sId)).toBe(agent.name);
  });

  it("writes nothing when a later change does not fit its agent", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const otherAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Other Agent",
    });
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    await AgentSuggestionFactory.createInstructions(auth, otherAgent, {
      suggestion: {
        content: "<p>Updated instructions.</p>",
        targetBlockId: "missing-block",
        type: "replace",
      },
      batchModelId: batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isErr()).toBe(true);
    expect(await fetchAgentName(agent.sId)).toBe(agent.name);
  });

  it("adds and removes the suggested skills", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const currentSkill = await SkillFactory.create(auth, {
      name: "Current Skill",
    });
    await SkillFactory.linkToAgent(auth, {
      skillId: currentSkill.id,
      agentConfigurationId: agent.id,
    });
    const newSkill = await SkillFactory.create(auth, { name: "New Skill" });
    await auth.refresh();
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createSkills(auth, agent, {
      suggestion: { action: "add", skillId: newSkill.sId },
      batchModelId,
    });
    await AgentSuggestionFactory.createSkills(auth, agent, {
      suggestion: { action: "remove", skillId: currentSkill.sId },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    if (res.isErr()) {
      throw res.error;
    }
    expect(await fetchAgentSkillIds(agent.sId)).toEqual([newSkill.sId]);
  });

  it("writes nothing when an added skill was archived since", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const skill = await SkillFactory.create(auth, {
      name: "Archived Skill",
      status: "archived",
    });
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    await AgentSuggestionFactory.createSkills(auth, agent, {
      suggestion: { action: "add", skillId: skill.sId },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    assert(res.isErr());
    expect(res.error.message).toContain("invalid, archived or not accessible");
    expect(await fetchAgentName(agent.sId)).toBe(agent.name);
    expect(await fetchAgentSkillIds(agent.sId)).toEqual([]);
  });

  it("lifts the space restriction of a removed skill", async () => {
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const addMembers = await restrictedSpace.addMembers(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      { userIds: [auth.getNonNullableUser().sId] }
    );
    assert(addMembers.isOk());
    await auth.refresh();
    const skill = await SkillFactory.create(auth, {
      name: "Restricted Skill",
      requestedSpaceIds: [restrictedSpace.id],
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      requestedSpaceIds: [restrictedSpace.id],
    });
    await SkillFactory.linkToAgent(auth, {
      skillId: skill.id,
      agentConfigurationId: agent.id,
    });
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createSkills(auth, agent, {
      suggestion: { action: "remove", skillId: skill.sId },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    if (res.isErr()) {
      throw res.error;
    }
    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(updated?.requestedSpaceIds).toEqual([]);
    expect(await fetchAgentSkillIds(agent.sId)).toEqual([]);
  });

  it("writes nothing when a skill change does not fit its skill", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const skill = await SkillFactory.create(auth);
    await auth.refresh();
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    await SkillSuggestionFactory.create(auth, skill, {
      kind: "name",
      suggestion: { name: "RenamedSkill" },
      batchModelId,
    });
    // Skills are edited before agents, so without the upfront resolution the skill would be renamed
    // before this rename fails.
    await SkillFactory.create(auth, { name: "Taken Name" });
    const otherSkill = await SkillFactory.create(auth, { name: "Other Skill" });
    await auth.refresh();
    await SkillSuggestionFactory.create(auth, otherSkill, {
      kind: "name",
      suggestion: { name: "Taken Name" },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isErr()).toBe(true);
    expect(await fetchAgentName(agent.sId)).toBe(agent.name);
    expect(await fetchSkillName(skill.sId)).toBe(skill.name);
  });

  const SKILL_CREATION = {
    name: "Meeting Notes",
    userFacingDescription: "Summarizes meeting notes.",
    agentFacingDescription: "Use to summarize meeting notes.",
    instructions: "<p>Summarize the notes.</p>",
  };

  async function grantSkillCreation() {
    await grantWorkspacePermission(workspace, user, {
      grantType: "create",
      resourceType: "skill",
    });
    await auth.refresh();
  }

  it("creates a skill from its create suggestion", async () => {
    await grantSkillCreation();
    const pendingRes = await SkillResource.createPending(auth);
    assert(pendingRes.isOk());
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await SkillSuggestionFactory.create(auth, pendingRes.value, {
      kind: "create",
      suggestion: SKILL_CREATION,
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isOk()).toBe(true);
    const created = await SkillResource.fetchById(auth, pendingRes.value.sId);
    expect(created?.status).toBe("active");
    expect(created?.name).toBe("Meeting Notes");
    expect(created?.availability).toBe("editors");
  });

  it("writes nothing when a create suggestion targets a skill that already exists", async () => {
    await grantSkillCreation();
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const skill = await SkillFactory.create(auth);
    await auth.refresh();
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    await SkillSuggestionFactory.create(auth, skill, {
      kind: "create",
      suggestion: SKILL_CREATION,
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isErr()).toBe(true);
    expect(await fetchAgentName(agent.sId)).toBe(agent.name);
    expect(await fetchSkillName(skill.sId)).toBe(skill.name);
  });

  it("edits a skill to reference a skill created in the same batch", async () => {
    await grantSkillCreation();
    const pendingRes = await SkillResource.createPending(auth);
    assert(pendingRes.isOk());
    const pending = pendingRes.value;
    const skill = await SkillFactory.create(auth);
    await auth.refresh();
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await SkillSuggestionFactory.create(auth, pending, {
      kind: "create",
      suggestion: SKILL_CREATION,
      batchModelId,
    });
    const reference = serializeSkillTag(
      { icon: null, id: pending.sId, name: SKILL_CREATION.name },
      { html: true }
    );
    await SkillSuggestionFactory.create(auth, skill, {
      suggestion: {
        instructionEdits: [
          {
            targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
            content: `<p>Start with ${reference}.</p>`,
            type: "replace",
          },
        ],
      },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isOk()).toBe(true);
    const created = await SkillResource.fetchById(auth, pending.sId);
    expect(created?.status).toBe("active");
    // The reference is normalized against the skill once it is created, so it keeps its name.
    const edited = await SkillResource.fetchById(auth, skill.sId);
    expect(edited?.instructions).toContain(pending.sId);
    expect(edited?.instructions).toContain(SKILL_CREATION.name);
  });

  // A tool of a restricted space the caller belongs to: a skill using it requests that space.
  async function createToolViewInRestrictedSpace() {
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      { userIds: [user.sId] }
    );
    await auth.refresh();
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "GitHub",
    });
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      restrictedSpace
    );

    return {
      restrictedSpace,
      toolHtml: `<tool id="${view.sId}" name="GitHub"></tool>`,
    };
  }

  function skillReferenceHtml(skillId: string, name: string) {
    return serializeSkillTag({ icon: null, id: skillId, name }, { html: true });
  }

  function replaceInstructions(content: string) {
    return {
      instructionEdits: [
        {
          targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
          content,
          type: "replace" as const,
        },
      ],
    };
  }

  it("requests the restricted spaces of a skill created in the same batch", async () => {
    await grantSkillCreation();
    const { restrictedSpace, toolHtml } =
      await createToolViewInRestrictedSpace();
    const pendingRes = await SkillResource.createPending(auth);
    assert(pendingRes.isOk());
    const pending = pendingRes.value;
    const skill = await SkillFactory.create(auth);
    await auth.refresh();
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await SkillSuggestionFactory.create(auth, pending, {
      kind: "create",
      suggestion: {
        ...SKILL_CREATION,
        instructions: `<p>Use ${toolHtml} then summarize.</p>`,
      },
      batchModelId,
    });
    await SkillSuggestionFactory.create(auth, skill, {
      suggestion: replaceInstructions(
        `<p>Start with ${skillReferenceHtml(pending.sId, SKILL_CREATION.name)}.</p>`
      ),
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isOk()).toBe(true);
    const created = await SkillResource.fetchById(auth, pending.sId);
    expect(created?.requestedSpaceIds).toContain(restrictedSpace.id);
    // The skill referencing it inherits its spaces.
    const edited = await SkillResource.fetchById(auth, skill.sId);
    expect(edited?.requestedSpaceIds).toContain(restrictedSpace.id);
  });

  it("adds the suggested tools to the agent with their default configuration", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Ticket Tracker",
    });
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    await AgentSuggestionFactory.createTools(auth, agent, {
      suggestion: { action: "add", toolId: view.sId },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isOk()).toBe(true);
    expect(await fetchAgentName(agent.sId)).toBe("RenamedAgent");
    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
    });
    expect(
      updated?.actions.filter(isServerSideMCPServerConfiguration)
    ).toMatchObject([
      {
        mcpServerViewId: view.sId,
        name: "ticket_tracker",
        dataSources: null,
        childAgentId: null,
      },
    ]);
  });

  it("removes the suggested tools from the agent", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const server = await RemoteMCPServerFactory.create(workspace);
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    await AgentMCPServerConfigurationFactory.create(auth, globalSpace, {
      agent,
      mcpServerView: view,
    });
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createTools(auth, agent, {
      suggestion: { action: "remove", toolId: view.sId },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isOk()).toBe(true);
    expect(await fetchAgentToolIds(agent.sId)).toEqual([]);
  });

  it("writes nothing when an added tool needs a configuration", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const searchView = await MCPServerViewFactory.internal(
      workspace,
      "search",
      globalSpace
    );
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createName(auth, agent, {
      suggestion: { name: "RenamedAgent" },
      batchModelId,
    });
    await AgentSuggestionFactory.createTools(auth, agent, {
      suggestion: { action: "add", toolId: searchView.sId },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    assert(res.isErr());
    expect(res.error.message).toContain("needs a configuration");
    expect(await fetchAgentName(agent.sId)).toBe(agent.name);
    expect(await fetchAgentToolIds(agent.sId)).toEqual([]);
  });

  async function createToolView(
    space: SpaceResource,
    options: { name?: string; description?: string } = {}
  ) {
    const server = await RemoteMCPServerFactory.create(workspace, options);
    return MCPServerViewFactory.create(workspace, server.sId, space);
  }

  it("lifts the space restriction of a removed tool", async () => {
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const addMembers = await restrictedSpace.addMembers(
      await Authenticator.internalAdminForWorkspace(workspace.sId),
      { userIds: [auth.getNonNullableUser().sId] }
    );
    assert(addMembers.isOk());
    await auth.refresh();
    const view = await createToolView(restrictedSpace);
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      requestedSpaceIds: [restrictedSpace.id],
    });
    await AgentMCPServerConfigurationFactory.create(auth, restrictedSpace, {
      agent,
      mcpServerView: view,
    });
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createTools(auth, agent, {
      suggestion: { action: "remove", toolId: view.sId },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isOk()).toBe(true);
    const updated = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "light",
    });
    expect(updated?.requestedSpaceIds).toEqual([]);
  });

  it("writes nothing when the removed tool is used by several actions", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const view = await createToolView(globalSpace);
    for (let i = 0; i < 2; i++) {
      await AgentMCPServerConfigurationFactory.create(auth, globalSpace, {
        agent,
        mcpServerView: view,
      });
    }
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createTools(auth, agent, {
      suggestion: { action: "remove", toolId: view.sId },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    assert(res.isErr());
    expect(res.error.message).toContain("cannot be removed by a suggestion");
    expect(await fetchAgentToolIds(agent.sId)).toEqual([view.sId, view.sId]);
  });

  async function createPendingAgent() {
    const pending = await AgentResource.createPending(auth);
    if (pending.isErr()) {
      throw pending.error;
    }
    const agent = await getAgentConfiguration(auth, {
      agentId: pending.value.sId,
      variant: "light",
    });
    assert(agent);
    return agent;
  }

  it("creates the agent with the suggested tools and skills", async () => {
    await grantWorkspacePermission(workspace, user, {
      grantType: "create",
      resourceType: "agent",
    });
    await auth.refresh();
    const agent = await createPendingAgent();
    const view = await createToolView(globalSpace, { name: "Ticket Tracker" });
    const skill = await SkillFactory.create(auth, { name: "Triage" });
    await auth.refresh();
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createCreate(auth, agent, {
      suggestion: {
        name: "IncidentHelper",
        description: "Helps triage incidents.",
        instructions: "<p>Triage incidents.</p>",
        toolIds: [view.sId],
        skillIds: [skill.sId],
      },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    if (res.isErr()) {
      throw res.error;
    }
    const created = await getAgentConfiguration(auth, {
      agentId: agent.sId,
      variant: "full",
    });
    expect(created).toMatchObject({ status: "active", name: "IncidentHelper" });
    expect(
      created?.actions.filter(isServerSideMCPServerConfiguration)
    ).toMatchObject([{ mcpServerViewId: view.sId, name: "ticket_tracker" }]);
    expect(await fetchAgentSkillIds(agent.sId)).toEqual([skill.sId]);
  });

  it("creates nothing when a tool of the creation needs a configuration", async () => {
    await grantWorkspacePermission(workspace, user, {
      grantType: "create",
      resourceType: "agent",
    });
    await auth.refresh();
    const agent = await createPendingAgent();
    const searchView = await MCPServerViewFactory.internal(
      workspace,
      "search",
      globalSpace
    );
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createCreate(auth, agent, {
      suggestion: {
        name: "Searcher",
        description: "Searches things.",
        instructions: "<p>Search things.</p>",
        toolIds: [searchView.sId],
      },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    assert(res.isErr());
    expect(res.error.message).toContain("needs a configuration");
    const unchanged = await AgentResource.fetchById(auth, agent.sId);
    expect(unchanged?.status).toBe("pending");
  });

  it("writes nothing when an added tool is restricted to skills", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const view = await createToolView(globalSpace);
    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    const restriction = await view.updateIsRestrictedToSkills(
      await Authenticator.fromUserIdAndWorkspaceId(admin.sId, workspace.sId),
      true
    );
    assert(restriction.isOk());
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    await AgentSuggestionFactory.createTools(auth, agent, {
      suggestion: { action: "add", toolId: view.sId },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    assert(res.isErr());
    expect(res.error.message).toContain("invalid or not accessible");
    expect(await fetchAgentToolIds(agent.sId)).toEqual([]);
  });

  it("requests the restricted spaces a skill edited earlier in the same batch gains", async () => {
    const { restrictedSpace, toolHtml } =
      await createToolViewInRestrictedSpace();
    const child = await SkillFactory.create(auth, { name: "Child Skill" });
    const parent = await SkillFactory.create(auth, { name: "Parent Skill" });
    await auth.refresh();
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    // Edits apply in batch order: the child gains the restricted tool before the parent is edited.
    await SkillSuggestionFactory.create(auth, child, {
      suggestion: replaceInstructions(`<p>Use ${toolHtml}.</p>`),
      batchModelId,
    });
    await SkillSuggestionFactory.create(auth, parent, {
      suggestion: replaceInstructions(
        `<p>Start with ${skillReferenceHtml(child.sId, child.name)}.</p>`
      ),
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isOk()).toBe(true);
    const edited = await SkillResource.fetchById(auth, parent.sId);
    expect(edited?.requestedSpaceIds).toContain(restrictedSpace.id);
  });

  it("lifts a space from a skill referencing one that loses it in the same batch", async () => {
    const { restrictedSpace } = await createToolViewInRestrictedSpace();
    const child = await SkillFactory.create(auth, {
      name: "Child Skill",
      requestedSpaceIds: [globalSpace.id, restrictedSpace.id],
    });
    const parent = await SkillFactory.create(auth, {
      name: "Parent Skill",
      instructions: `Start with ${serializeSkillTag({ icon: null, id: child.sId, name: child.name })}.`,
      requestedSpaceIds: [globalSpace.id, restrictedSpace.id],
    });
    await auth.refresh();
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    // The child no longer uses anything of the restricted space; the parent is only renamed.
    await SkillSuggestionFactory.create(auth, child, {
      suggestion: replaceInstructions("<p>Summarize.</p>"),
      batchModelId,
    });
    await SkillSuggestionFactory.create(auth, parent, {
      kind: "name",
      suggestion: { name: "Renamed Parent" },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isOk()).toBe(true);
    const edited = await SkillResource.fetchById(auth, parent.sId);
    expect(edited?.name).toBe("Renamed Parent");
    expect(edited?.requestedSpaceIds).not.toContain(restrictedSpace.id);
  });

  it("writes nothing when an editor added with a restricted space cannot read it", async () => {
    const { toolHtml } = await createToolViewInRestrictedSpace();
    const newEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, newEditor, { role: "user" });
    const skill = await SkillFactory.create(auth);
    await auth.refresh();
    const { id: batchModelId, sId } =
      await BatchSuggestionFactory.createEmpty(auth);
    // The new editor can read the skill as it is, but not the space the edit pulls in.
    await SkillSuggestionFactory.create(auth, skill, {
      suggestion: replaceInstructions(`<p>Use ${toolHtml}.</p>`),
      batchModelId,
    });
    await SkillSuggestionFactory.create(auth, skill, {
      kind: "editors",
      suggestion: { addUserIds: [newEditor.sId], removeUserIds: [] },
      batchModelId,
    });

    const res = await applyBatchSuggestions(auth, await fetchBatch(sId));

    expect(res.isErr()).toBe(true);
    const unchanged = await SkillResource.fetchById(auth, skill.sId);
    expect(unchanged?.instructions).toBe(skill.instructions);
    const editors = (await unchanged?.listEditors(auth)) ?? [];
    expect(editors.map((user) => user.sId)).not.toContain(newEditor.sId);
  });
});
