import {
  archiveAgentConfiguration,
  cleanupAgentScopedResourcesForHardDeletion,
  createAgentConfiguration,
  createPendingAgentConfiguration,
  getAgentConfiguration,
  getAgentConfigurations,
  restoreAgentConfiguration,
  unsafeHardDeleteAgentConfiguration,
  updateAgentConfigurationsScope,
} from "@app/lib/api/assistant/configuration/agent";
import { setAgentUserFavorite } from "@app/lib/api/assistant/user_relation";
import { Authenticator } from "@app/lib/auth";
import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { AgentUserRelationResource } from "@app/lib/resources/agent_user_relation_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import * as scheduleClient from "@app/temporal/triggers/schedule_client";
import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WakeUpFactory } from "@app/tests/utils/WakeUpFactory";
import { Err, Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

describe("getAgentConfigurations", () => {
  it("returns only the latest version of each requested agent", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const firstAgent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const secondAgent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Second agent" }
    );

    await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstAgent.sId
    );
    const latestFirstAgent = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstAgent.sId
    );
    const latestSecondAgent = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      secondAgent.sId,
      { name: "Second agent" }
    );

    const agents = await getAgentConfigurations(authenticator, {
      agentIds: [
        firstAgent.sId,
        secondAgent.sId,
        firstAgent.sId,
        generateRandomModelSId(),
      ],
      variant: "light",
      dangerouslySkipPermissionFiltering: true,
    });

    expect(agents.map(({ sId, version }) => ({ sId, version }))).toEqual([
      { sId: latestFirstAgent.sId, version: latestFirstAgent.version },
      { sId: latestSecondAgent.sId, version: latestSecondAgent.version },
    ]);
  });
});

describe("stable agent identities", () => {
  it("reuses one identity across agent versions", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const firstVersion =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstVersion.sId
    );

    const versions = await AgentConfigurationModel.findAll({
      where: { sId: firstVersion.sId, workspaceId: workspace.id },
      attributes: ["agentId"],
    });
    const agentModelIds = new Set(versions.map((version) => version.agentId));

    expect(versions).toHaveLength(2);
    expect(agentModelIds.size).toBe(1);
    expect([...agentModelIds][0]).not.toBeNull();
  });

  it("deletes the identity only after its last version is deleted", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const firstVersion =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const secondVersion = await AgentConfigurationFactory.updateTestAgent(
      authenticator,
      firstVersion.sId
    );

    await unsafeHardDeleteAgentConfiguration(authenticator, secondVersion);
    expect(
      await AgentModel.findOne({
        where: { sId: firstVersion.sId, workspaceId: workspace.id },
      })
    ).not.toBeNull();

    await unsafeHardDeleteAgentConfiguration(authenticator, firstVersion);
    expect(
      await AgentModel.findOne({
        where: { sId: firstVersion.sId, workspaceId: workspace.id },
      })
    ).toBeNull();
  });
});

describe("createAgentConfiguration with pending agent", () => {
  it("converts pending agent to active when agentConfigurationId points to a pending agent", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const newEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, newEditor, { role: "user" });

    // Create a pending agent using the helper function
    const pendingAgentRes =
      await createPendingAgentConfiguration(authenticator);
    if (pendingAgentRes.isErr()) {
      throw pendingAgentRes.error;
    }
    const { sId: pendingId } = pendingAgentRes.value;

    const pendingAgentModelId = await AgentResource.fetchModelId(
      authenticator,
      pendingId
    );
    expect(pendingAgentModelId).not.toBeNull();
    if (!pendingAgentModelId) {
      throw new Error("Pending agent was not created");
    }
    const pendingGrantGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(
        authenticator,
        {
          grantType: "editor",
          resourceType: "agent",
          resourceId: pendingAgentModelId,
        }
      );
    expect(pendingGrantGroup).not.toBeNull();
    if (!pendingGrantGroup) {
      throw new Error("Pending agent editor grant was not created");
    }
    expect(
      (await pendingGrantGroup.getActiveMembers(authenticator)).map(
        (editor) => editor.sId
      )
    ).toEqual([user.sId]);

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
      editors: [user.toJSON(), newEditor.toJSON()],
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
    if (!agent) {
      throw new Error("Pending agent was not converted");
    }
    expect(agent.status).toBe("active");
    expect(agent.name).toBe("My New Agent");
    expect(agent.version).toBe(0); // Version should remain 0 (updated in place)

    expect(
      new Set(
        (await pendingGrantGroup.getActiveMembers(authenticator)).map(
          (editor) => editor.sId
        )
      )
    ).toEqual(new Set([user.sId, newEditor.sId]));
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

    // Create another user in the same workspace. Role is irrelevant to what this test asserts
    // (ownership of the pending agent), so use "admin" to bypass the create-agent capability
    // check in createPendingAgentConfiguration.
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, {
      role: "admin",
    });
    const otherAuthenticator = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    // Create a pending agent owned by the other user using the helper function
    const otherPendingAgentRes =
      await createPendingAgentConfiguration(otherAuthenticator);
    if (otherPendingAgentRes.isErr()) {
      throw otherPendingAgentRes.error;
    }
    const { sId: pendingId } = otherPendingAgentRes.value;

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
    // Role is irrelevant to what this test asserts (suggestion preservation across the
    // pending-to-active conversion), so use "admin" to bypass the create-agent capability check.
    const { authenticator, user } = await createResourceTest({
      role: "admin",
    });
    const pendingAgentRes =
      await createPendingAgentConfiguration(authenticator);
    if (pendingAgentRes.isErr()) {
      throw pendingAgentRes.error;
    }
    const { sId: pendingId } = pendingAgentRes.value;
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

describe("create agent capability", () => {
  async function memberAuthInGroup(
    workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"],
    group?: Awaited<ReturnType<typeof GroupFactory.regularAuto>>
  ) {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    if (group) {
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await GroupFactory.withMembers(adminAuth, group, [user]);
    }
    const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    return { authenticator, user };
  }

  it("rejects creating a brand-new agent for a user without the capability", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    const { authenticator, user } = await memberAuthInGroup(workspace);

    const result = await createAgentConfiguration(authenticator, {
      name: "Unauthorized Agent",
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
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Creating agents is restricted.");
    }
  });

  it("rejects a nonexistent agentConfigurationId used to bypass the capability check", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    const { authenticator, user } = await memberAuthInGroup(workspace);

    const result = await createAgentConfiguration(authenticator, {
      name: "Unauthorized Agent",
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
      // Doesn't match any real row, so this would otherwise take the "create new" branch.
      agentConfigurationId: generateRandomModelSId(),
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Creating agents is restricted.");
    }
  });

  it("allows creating a brand-new agent for a user granted via a group", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const group = await GroupFactory.regularAuto(workspace, "agent-creators");
    await GroupPermissionResource.grantTypeWide(adminAuth, {
      group,
      grantType: "create",
      resourceType: "agent",
    });
    const { authenticator, user } = await memberAuthInGroup(workspace, group);

    const result = await createAgentConfiguration(authenticator, {
      name: "Authorized Agent",
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
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });

    expect(result.isOk()).toBe(true);
  });

  it("does not gate creating a new version of an existing agent", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const existingAgent = await AgentConfigurationFactory.createTestAgent(
      adminAuth,
      { scope: "hidden" }
    );
    const { authenticator, user } = await memberAuthInGroup(workspace);
    // No capability grant for this user; only editing rights on the existing agent matter here.
    const editorGroupRes = await GroupResource.findEditorGroupForAgent(
      adminAuth,
      existingAgent
    );
    if (editorGroupRes.isErr()) {
      throw editorGroupRes.error;
    }
    await GroupFactory.withMembers(adminAuth, editorGroupRes.value, [user]);
    await authenticator.refresh();

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
  });

  it("rejects createPendingAgentConfiguration for a user without the capability", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    const { authenticator } = await memberAuthInGroup(workspace);

    const result = await createPendingAgentConfiguration(authenticator);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Creating agents is restricted.");
    }
  });

  it("allows createPendingAgentConfiguration for a user granted via a group", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const group = await GroupFactory.regularAuto(workspace, "agent-creators");
    await GroupPermissionResource.grantTypeWide(adminAuth, {
      group,
      grantType: "create",
      resourceType: "agent",
    });
    const { authenticator } = await memberAuthInGroup(workspace, group);

    const result = await createPendingAgentConfiguration(authenticator);

    expect(result.isOk()).toBe(true);
  });
});

describe("archiveAgentConfiguration and restoreAgentConfiguration", () => {
  it("keeps editor group memberships active while archiving and restoring", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });

    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const editorGroupRes = await GroupResource.findEditorGroupForAgent(
      authenticator,
      agent
    );
    if (editorGroupRes.isErr()) {
      throw editorGroupRes.error;
    }
    const editorGroup = editorGroupRes.value;

    const membershipsBeforeArchive = await GroupMembershipModel.findAll({
      where: {
        groupId: editorGroup.id,
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
        groupId: editorGroup.id,
        workspaceId: workspace.id,
      },
    });
    expect(membershipsAfterArchive.every((m) => m.status === "active")).toBe(
      true
    );

    const editorsAfterArchive =
      await editorGroup.getActiveMembers(authenticator);
    expect(editorsAfterArchive.map((editor) => editor.id)).toEqual([
      authenticator.getNonNullableUser().id,
    ]);

    const restoreResult = await restoreAgentConfiguration(
      authenticator,
      agent.sId
    );
    expect(restoreResult.isOk()).toBe(true);
    expect(restoreResult.isOk() && restoreResult.value.restored).toBe(true);

    const membershipsAfterRestore = await GroupMembershipModel.findAll({
      where: {
        groupId: editorGroup.id,
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

  it("cancels scheduled wake-ups when archiving", async () => {
    const launchSpy = vi
      .spyOn(wakeUpClient, "launchOrScheduleWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));
    const cancelSpy = vi
      .spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));

    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });

    const wakeUp = await WakeUpFactory.cron(
      authenticator,
      conversation,
      agent,
      {
        reason: "Daily wake-up",
      }
    );

    const archived = await archiveAgentConfiguration(authenticator, agent.sId);
    expect(archived).toBe(true);

    expect(cancelSpy).toHaveBeenCalled();
    const refetched = await WakeUpResource.fetchById(authenticator, wakeUp.sId);
    expect(refetched?.status).toBe("cancelled");

    launchSpy.mockRestore();
    cancelSpy.mockRestore();
  });

  it("reconciles the leaked schedule of a terminal cron wake-up when archiving", async () => {
    const launchSpy = vi
      .spyOn(wakeUpClient, "launchOrScheduleWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));
    const cancelSpy = vi
      .spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));

    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });

    const wakeUp = await WakeUpFactory.cron(
      authenticator,
      conversation,
      agent,
      {
        reason: "Daily wake-up",
      }
    );

    // Drive the wake-up to a terminal state via a DB-only cancel (markCancelled
    // does not touch Temporal), simulating a cron schedule that leaked when the
    // wake-up became terminal.
    await wakeUp.markCancelled(authenticator);

    // Only count the Temporal calls made by archiving.
    cancelSpy.mockClear();

    const archived = await archiveAgentConfiguration(authenticator, agent.sId);
    expect(archived).toBe(true);

    // Archive must reconcile the leaked schedule even though the row is already
    // terminal (it used to skip non-scheduled wake-ups entirely).
    expect(cancelSpy).toHaveBeenCalled();

    launchSpy.mockRestore();
    cancelSpy.mockRestore();
  });
});

describe("cleanupAgentScopedResourcesForHardDeletion", () => {
  it("removes triggers, wake-ups and favorites for the agent", async () => {
    const mockCreateSchedule = vi
      .spyOn(scheduleClient, "createOrUpdateAgentSchedule")
      .mockResolvedValue(new Ok("workflow-id"));
    const mockDeleteSchedule = vi
      .spyOn(scheduleClient, "deleteTriggerSchedule")
      .mockResolvedValue(new Ok(undefined));
    const launchSpy = vi
      .spyOn(wakeUpClient, "launchOrScheduleWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));
    const cancelSpy = vi
      .spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));

    const { authenticator } = await createResourceTest({
      role: "admin",
    });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    await TriggerFactory.schedule(authenticator, {
      agentConfigurationId: agent.sId,
      status: "enabled",
      configuration: {
        cron: "0 9 * * 1",
        timezone: "UTC",
      },
    });

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });
    await WakeUpFactory.cron(authenticator, conversation, agent, {
      reason: "Daily wake-up",
    });

    const favoriteResult = await setAgentUserFavorite({
      auth: authenticator,
      agentId: agent.sId,
      userFavorite: true,
    });
    expect(favoriteResult.isOk()).toBe(true);

    await cleanupAgentScopedResourcesForHardDeletion(authenticator, agent.sId);

    const remainingTriggers = await TriggerResource.listByAgentConfigurationId(
      authenticator,
      agent.sId
    );
    expect(remainingTriggers).toHaveLength(0);

    const remainingWakeUps = await WakeUpResource.listByAgentConfigurationId(
      authenticator,
      agent.sId
    );
    expect(remainingWakeUps).toHaveLength(0);

    const remainingFavoriteCount =
      await AgentUserRelationResource.countForAgent(authenticator, agent.sId);
    expect(remainingFavoriteCount).toBe(0);

    expect(mockDeleteSchedule).toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalled();

    mockCreateSchedule.mockRestore();
    mockDeleteSchedule.mockRestore();
    launchSpy.mockRestore();
    cancelSpy.mockRestore();
  });

  it("keeps the wake-up row when Temporal cancellation fails", async () => {
    const launchSpy = vi
      .spyOn(wakeUpClient, "launchOrScheduleWakeUpTemporalWorkflow")
      .mockResolvedValue(new Ok(undefined));
    // Simulate a transient Temporal failure when cancelling the schedule.
    const cancelSpy = vi
      .spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow")
      .mockResolvedValue(new Err(new Error("temporal unavailable")));

    const { authenticator } = await createResourceTest({ role: "admin" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });
    await WakeUpFactory.cron(authenticator, conversation, agent, {
      reason: "Daily wake-up",
    });

    await cleanupAgentScopedResourcesForHardDeletion(authenticator, agent.sId);

    // The Temporal schedule could not be deleted, so the row must survive to
    // keep the wake-up id available for a retry / the reconciler.
    const remainingWakeUps = await WakeUpResource.listByAgentConfigurationId(
      authenticator,
      agent.sId
    );
    expect(remainingWakeUps).toHaveLength(1);
    expect(remainingWakeUps[0].status).toBe("scheduled");

    launchSpy.mockRestore();
    cancelSpy.mockRestore();
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
      role: "user",
    });
    const ownedAgent = await AgentConfigurationFactory.createTestAgent(
      ownerAuth,
      { name: "Owned", scope: "hidden" }
    );

    // Another builder who has no editing rights on the agent.
    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });
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
      plan: "creditPriced",
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { scope: "visible" }
    );

    // A workspace member who is not in the agent's editor group.
    const nonEditor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, nonEditor, {
      role: "user",
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
      executionMode: "user_pool",
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
      executionMode: "user_pool",
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

describe("publish agent capability", () => {
  type TestAgent = Awaited<
    ReturnType<typeof AgentConfigurationFactory.createTestAgent>
  >;

  // Builds a non-admin editor of `agent` (so they can save new versions and pass the canEdit
  // filter). With `withPublishCapability`, grants the workspace-wide publish permission to a group
  // the user belongs to. Editing an existing agent is not create-gated, so no create grant is
  // needed here — this isolates the publish/unpublish check.
  async function editorAuthFor(
    workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"],
    agent: TestAgent,
    { withPublishCapability = false }: { withPublishCapability?: boolean } = {}
  ) {
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const editorGroupRes = await GroupResource.findEditorGroupForAgent(
      adminAuth,
      agent
    );
    if (editorGroupRes.isErr()) {
      throw editorGroupRes.error;
    }
    await GroupFactory.withMembers(adminAuth, editorGroupRes.value, [user]);

    if (withPublishCapability) {
      const group = await GroupFactory.regularAuto(workspace, "publishers");
      await GroupPermissionResource.grantTypeWide(adminAuth, {
        group,
        grantType: "publish",
        resourceType: "agent",
      });
      await GroupFactory.withMembers(adminAuth, group, [user]);
    }

    // Created after all group memberships so the authenticator resolves them without a refresh.
    const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    return { authenticator, user };
  }

  async function saveVersionWithScope(
    auth: Authenticator,
    agent: TestAgent,
    user: Awaited<ReturnType<typeof UserFactory.basic>>,
    scope: "hidden" | "visible"
  ) {
    return createAgentConfiguration(auth, {
      name: agent.name,
      description: "Test",
      instructions: null,
      instructionsHtml: null,
      pictureUrl: "https://dust.tt/static/systemavatar/test_avatar_1.png",
      status: "active",
      scope,
      model: {
        providerId: "anthropic",
        modelId: "claude-sonnet-4-5-20250929",
        temperature: 0.7,
      },
      agentConfigurationId: agent.sId,
      templateId: null,
      requestedSpaceIds: [],
      tags: [],
      editors: [user.toJSON()],
      authorId: user.id,
    });
  }

  it("rejects publishing (hidden → visible) for an editor without the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "hidden",
    });
    const { authenticator, user } = await editorAuthFor(workspace, agent);

    const result = await saveVersionWithScope(
      authenticator,
      agent,
      user,
      "visible"
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "You don't have permission to publish agents."
      );
    }
  });

  it("allows publishing (hidden → visible) for an editor granted the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "hidden",
    });
    const { authenticator, user } = await editorAuthFor(workspace, agent, {
      withPublishCapability: true,
    });

    const result = await saveVersionWithScope(
      authenticator,
      agent,
      user,
      "visible"
    );
    expect(result.isOk()).toBe(true);
  });

  it("rejects unpublishing (visible → hidden) for an editor without the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "visible",
    });
    const { authenticator, user } = await editorAuthFor(workspace, agent);

    const result = await saveVersionWithScope(
      authenticator,
      agent,
      user,
      "hidden"
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "You don't have permission to publish agents."
      );
    }
  });

  it("allows unpublishing (visible → hidden) for an editor granted the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "visible",
    });
    const { authenticator, user } = await editorAuthFor(workspace, agent, {
      withPublishCapability: true,
    });

    const result = await saveVersionWithScope(
      authenticator,
      agent,
      user,
      "hidden"
    );
    expect(result.isOk()).toBe(true);
  });

  it("does not gate a new version that keeps the agent visible", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "visible",
    });
    const { authenticator, user } = await editorAuthFor(workspace, agent);

    // The published state does not change, so no publish permission is required to edit.
    const result = await saveVersionWithScope(
      authenticator,
      agent,
      user,
      "visible"
    );
    expect(result.isOk()).toBe(true);
  });

  it("rejects a bulk scope change to visible without the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "hidden",
    });
    const { authenticator } = await editorAuthFor(workspace, agent);

    const result = await updateAgentConfigurationsScope(
      authenticator,
      [agent.sId],
      "visible"
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "You don't have permission to publish agents."
      );
    }
  });

  it("rejects a bulk scope change to hidden without the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "visible",
    });
    const { authenticator } = await editorAuthFor(workspace, agent);

    const result = await updateAgentConfigurationsScope(
      authenticator,
      [agent.sId],
      "hidden"
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(
        "You don't have permission to publish agents."
      );
    }
  });

  it("allows a bulk scope change for an editor granted the publish capability", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      scope: "hidden",
    });
    const { authenticator } = await editorAuthFor(workspace, agent, {
      withPublishCapability: true,
    });

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
});
