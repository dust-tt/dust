import {
  archiveAgentConfiguration,
  createAgentConfiguration,
  createPendingAgentConfiguration,
  getAgentConfiguration,
  restoreAgentConfiguration,
  updateAgentConfigurationsScope,
} from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

describe("createAgentConfiguration with pending agent", () => {
  it("converts pending agent to active when agentConfigurationId points to a pending agent", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });

    // Create a pending agent using the helper function
    const { sId: pendingId } =
      await createPendingAgentConfiguration(authenticator);

    // Convert the pending agent to active by passing its sId as agentConfigurationId
    const result = await createAgentConfiguration(authenticator, {
      name: "My New Agent",
      description: "A test agent",
      instructions: "Test instructions",
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.5,
      },
      agentConfigurationId: pendingId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sId).toBe(pendingId);
      expect(result.value.status).toBe("active");
      expect(result.value.name).toBe("My New Agent");
      expect(result.value.description).toBe("A test agent");
    }

    const agent = await AgentConfigurationModel.findOne({
      where: { sId: pendingId, workspaceId: workspace.id },
    });
    expect(agent).not.toBeNull();
    expect(agent!.status).toBe("active");
    expect(agent!.name).toBe("My New Agent");
    expect(agent!.version).toBe(0); // Version should remain 0 (updated in place)
  });

  it("creates new agent if agentConfigurationId does not exist", async () => {
    const { authenticator, user } = await createResourceTest({
      role: "admin",
    });

    const nonExistentId = generateRandomModelSId();

    const result = await createAgentConfiguration(authenticator, {
      name: "Fallback Agent",
      description: "Test",
      instructions: null,
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.7,
      },
      agentConfigurationId: nonExistentId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should have created a new agent with the provided sId
      expect(result.value.sId).toBe(nonExistentId);
      expect(result.value.name).toBe("Fallback Agent");
      expect(result.value.status).toBe("active");
    }
  });

  it("returns error when trying to update pending agent owned by different user", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });

    // Create another user in the same workspace
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, {
      role: "builder",
    });
    const otherAuthenticator = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    // Create a pending agent owned by the other user using the helper function
    const { sId: pendingId } =
      await createPendingAgentConfiguration(otherAuthenticator);

    // Should return an error because pending agents owned by other users cannot be updated
    const result = await createAgentConfiguration(authenticator, {
      name: "My Agent",
      description: "Test",
      instructions: null,
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.7,
      },
      agentConfigurationId: pendingId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "Cannot update a pending agent owned by another user."
      );
    }
  });

  it("creates new version if agent is not in pending status", async () => {
    const { authenticator, user } = await createResourceTest({
      role: "admin",
    });

    // Create an active agent (not pending) using the factory
    const existingAgent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const result = await createAgentConfiguration(authenticator, {
      name: "Updated Agent",
      description: "Test",
      instructions: null,
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.7,
      },
      agentConfigurationId: existingAgent.sId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      // Should have created a new version since the agent is not pending
      expect(result.value.sId).toBe(existingAgent.sId);
      expect(result.value.name).toBe("Updated Agent");
      expect(result.value.version).toBe(1); // Version bumped
    }
  });

  it("preserves suggestions when converting pending agent to active", async () => {
    const { authenticator, user } = await createResourceTest({
      role: "builder",
    });
    const { sId: pendingId } =
      await createPendingAgentConfiguration(authenticator);
    const pendingAgent = await getAgentConfiguration(authenticator, {
      agentId: pendingId,
      variant: "light",
    });
    expect(pendingAgent).not.toBeNull();

    const originalAgentId = pendingAgent!.id;

    await AgentSuggestionFactory.createInstructions(
      authenticator,
      pendingAgent!,
      {
        suggestion: {
          content: "<p>new</p>",
          targetBlockId: "1234",
          type: "replace",
        },
      }
    );

    const result = await createAgentConfiguration(authenticator, {
      name: "Agent From Pending With Suggestions",
      description: "Test agent",
      instructions: "Test instructions",
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope: "hidden",
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.5,
      },
      agentConfigurationId: pendingId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.sId).toBe(pendingId);
      expect(result.value.status).toBe("active");
      expect(result.value.id).toBe(originalAgentId);

      const suggestionsAfter =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          result.value.sId
        );
      expect(suggestionsAfter).toHaveLength(1);
    }
  });
});

describe("archiveAgentConfiguration and restoreAgentConfiguration", () => {
  it("suspends editor group memberships when archiving and restores them when restoring", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const editorGroupRes = await GroupResource.findEditorGroupForAgent(
      authenticator,
      agent
    );
    expect(editorGroupRes.isOk()).toBe(true);
    const editorGroup = editorGroupRes.isOk() ? editorGroupRes.value : null;
    expect(editorGroup).not.toBeNull();

    const membershipsBeforeArchive = await GroupMembershipModel.findAll({
      where: {
        groupId: editorGroup!.id,
        workspaceId: workspace.id,
      },
    });
    expect(membershipsBeforeArchive.length).toBeGreaterThan(0);
    expect(membershipsBeforeArchive.every((m) => m.status === "active")).toBe(
      true
    );

    const archived = await archiveAgentConfiguration(authenticator, agent.sId);
    expect(archived).toBe(true);

    const membershipsAfterArchive = await GroupMembershipModel.findAll({
      where: {
        groupId: editorGroup!.id,
        workspaceId: workspace.id,
      },
    });
    expect(membershipsAfterArchive.every((m) => m.status === "suspended")).toBe(
      true
    );

    const restoreResult = await restoreAgentConfiguration(
      authenticator,
      agent.sId
    );
    expect(restoreResult.isOk()).toBe(true);
    expect(restoreResult.isOk() && restoreResult.value.restored).toBe(true);

    const membershipsAfterRestore = await GroupMembershipModel.findAll({
      where: {
        groupId: editorGroup!.id,
        workspaceId: workspace.id,
      },
    });
    expect(membershipsAfterRestore.every((m) => m.status === "active")).toBe(
      true
    );
  });

  it("restore returns error when agent is not archived", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const restoreResult = await restoreAgentConfiguration(
      authenticator,
      agent.sId
    );
    expect(restoreResult.isErr()).toBe(true);
    if (restoreResult.isErr()) {
      expect(restoreResult.error.message).toBe(
        "Agent configuration is not archived"
      );
    }
  });
});

describe("updateAgentConfigurationsScope", () => {
  it("updates the scope of a single agent", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { scope: "hidden" }
    );

    const result = await updateAgentConfigurationsScope(
      authenticator,
      [agent.sId],
      "visible"
    );
    expect(result.isOk()).toBe(true);

    const row = await AgentConfigurationModel.findOne({
      where: { sId: agent.sId, workspaceId: workspace.id },
    });
    expect(row!.scope).toBe("visible");
  });

  it("updates the scope of multiple agents in a single call", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const agents = await Promise.all([
      AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "A1",
        scope: "hidden",
      }),
      AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "A2",
        scope: "hidden",
      }),
      AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "A3",
        scope: "hidden",
      }),
    ]);

    const result = await updateAgentConfigurationsScope(
      authenticator,
      agents.map((a) => a.sId),
      "visible"
    );
    expect(result.isOk()).toBe(true);

    for (const a of agents) {
      const row = await AgentConfigurationModel.findOne({
        where: { sId: a.sId, workspaceId: workspace.id },
      });
      expect(row!.scope).toBe("visible");
    }
  });

  it("returns Ok without changes when agentIds is empty", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const result = await updateAgentConfigurationsScope(
      authenticator,
      [],
      "visible"
    );
    expect(result.isOk()).toBe(true);
  });

  it("skips agents the caller cannot edit and is not admin of", async () => {
    const { authenticator: ownerAuth, workspace } = await createResourceTest({
      role: "builder",
    });
    const ownedAgent = await AgentConfigurationFactory.createTestAgent(
      ownerAuth,
      { name: "Owned", scope: "hidden" }
    );

    // Another builder who has no editing rights on the agent.
    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "builder" });
    const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      outsider.sId,
      workspace.sId
    );

    const result = await updateAgentConfigurationsScope(
      outsiderAuth,
      [ownedAgent.sId],
      "visible"
    );
    expect(result.isOk()).toBe(true);

    const row = await AgentConfigurationModel.findOne({
      where: { sId: ownedAgent.sId, workspaceId: workspace.id },
    });
    expect(row!.scope).toBe("hidden");
  });

  it("disables triggers of non-editors when transitioning visible → hidden", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { scope: "visible" }
    );

    // A workspace member who is not in the agent's editor group.
    const nonEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, nonEditor, {
      role: "builder",
    });

    // Trigger owned by the admin (member of the editor group).
    const editorTriggerRes = await TriggerResource.makeNew(authenticator, {
      workspaceId: workspace.id,
      name: "editor-trigger",
      kind: "webhook",
      agentConfigurationId: agent.sId,
      editor: user.id,
      customPrompt: null,
      status: "enabled",
      configuration: { includePayload: true },
      webhookSourceViewId: null,
      origin: "user",
    });
    expect(editorTriggerRes.isOk()).toBe(true);
    const editorTrigger = editorTriggerRes.isOk()
      ? editorTriggerRes.value
      : null;

    // Trigger owned by the non-editor user.
    const nonEditorTriggerRes = await TriggerResource.makeNew(authenticator, {
      workspaceId: workspace.id,
      name: "non-editor-trigger",
      kind: "webhook",
      agentConfigurationId: agent.sId,
      editor: nonEditor.id,
      customPrompt: null,
      status: "enabled",
      configuration: { includePayload: true },
      webhookSourceViewId: null,
      origin: "user",
    });
    expect(nonEditorTriggerRes.isOk()).toBe(true);
    const nonEditorTrigger = nonEditorTriggerRes.isOk()
      ? nonEditorTriggerRes.value
      : null;

    const result = await updateAgentConfigurationsScope(
      authenticator,
      [agent.sId],
      "hidden"
    );
    expect(result.isOk()).toBe(true);

    const refreshedEditorTrigger = await TriggerResource.fetchById(
      authenticator,
      editorTrigger!.sId
    );
    const refreshedNonEditorTrigger = await TriggerResource.fetchById(
      authenticator,
      nonEditorTrigger!.sId
    );

    expect(refreshedEditorTrigger!.status).toBe("enabled");
    expect(refreshedNonEditorTrigger!.status).toBe("disabled");
  });
});
