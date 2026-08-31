import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import * as temporalClient from "@app/temporal/triggers/schedule_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

describe("TriggerResource", () => {
  describe("disableAllForWorkspace", () => {
    it("should successfully disable all enabled triggers in a workspace", async () => {
      // Mock temporal workflow operations to avoid failures in test environment
      const mockCreateOrUpdateWorkflow = vi
        .spyOn(temporalClient, "createOrUpdateAgentSchedule")
        .mockResolvedValue(new Ok("workflow-id"));
      const mockDeleteWorkflow = vi
        .spyOn(temporalClient, "deleteTriggerSchedule")
        .mockResolvedValue(new Ok(undefined));

      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      // Create an agent configuration for the triggers
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Test Agent" }
      );

      // Create multiple triggers - some enabled, some disabled
      const trigger1Result = await TriggerResource.makeNew(authenticator, {
        id: 123,
        workspaceId: workspace.id,
        name: "Enabled Trigger 1",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: authenticator.getNonNullableUser().id,
        customPrompt: null,
        status: "enabled",
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
        origin: "user",
        executionMode: "user_pool",
      });

      const trigger2Result = await TriggerResource.makeNew(authenticator, {
        id: 124,
        workspaceId: workspace.id,
        name: "Enabled Trigger 2",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: authenticator.getNonNullableUser().id,
        customPrompt: null,
        status: "enabled",
        configuration: {
          cron: "0 10 * * 1",
          timezone: "UTC",
        },
        origin: "user",
        executionMode: "user_pool",
      });

      const trigger3Result = await TriggerResource.makeNew(authenticator, {
        id: 125,
        workspaceId: workspace.id,
        name: "Disabled Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: authenticator.getNonNullableUser().id,
        customPrompt: null,
        status: "disabled",
        configuration: {
          cron: "0 11 * * 1",
          timezone: "UTC",
        },
        origin: "user",
        executionMode: "user_pool",
      });

      expect(trigger1Result.isOk()).toBe(true);
      expect(trigger2Result.isOk()).toBe(true);
      expect(trigger3Result.isOk()).toBe(true);

      if (
        trigger1Result.isErr() ||
        trigger2Result.isErr() ||
        trigger3Result.isErr()
      ) {
        throw new Error("Failed to create test triggers");
      }

      const trigger1 = trigger1Result.value;
      const trigger2 = trigger2Result.value;
      const trigger3 = trigger3Result.value;

      // Verify initial state
      expect(trigger1.status).toBe("enabled");
      expect(trigger2.status).toBe("enabled");
      expect(trigger3.status).toBe("disabled");

      // Disable all triggers for the workspace with "relocating" status
      const result = await TriggerResource.disableAllForWorkspace(
        authenticator,
        "relocating"
      );

      expect(result.isOk()).toBe(true);

      // Fetch updated triggers to verify they were disabled
      const updatedTrigger1 = await TriggerResource.fetchById(
        authenticator,
        trigger1.sId
      );
      const updatedTrigger2 = await TriggerResource.fetchById(
        authenticator,
        trigger2.sId
      );
      const updatedTrigger3 = await TriggerResource.fetchById(
        authenticator,
        trigger3.sId
      );

      expect(updatedTrigger1).toBeTruthy();
      expect(updatedTrigger2).toBeTruthy();
      expect(updatedTrigger3).toBeTruthy();

      // Previously enabled triggers should now be set to "relocating"
      expect(updatedTrigger1!.status).toBe("relocating");
      expect(updatedTrigger2!.status).toBe("relocating");
      // Previously disabled trigger should remain disabled
      expect(updatedTrigger3!.status).toBe("disabled");

      // Clean up mocks
      mockCreateOrUpdateWorkflow.mockRestore();
      mockDeleteWorkflow.mockRestore();
    });
  });

  describe("enableAllForWorkspace", () => {
    it("should successfully enable all disabled triggers that point to active agents", async () => {
      // Mock temporal workflow operations
      const mockCreateOrUpdateWorkflow = vi
        .spyOn(temporalClient, "createOrUpdateAgentSchedule")
        .mockResolvedValue(new Ok("workflow-id"));
      const mockDeleteWorkflow = vi
        .spyOn(temporalClient, "deleteTriggerSchedule")
        .mockResolvedValue(new Ok(undefined));

      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      // Create agent configurations - one active, one archived
      const activeAgentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Active Agent" }
      );

      const archivedAgentConfig =
        await AgentConfigurationFactory.createTestAgent(authenticator, {
          name: "Archived Agent",
        });

      // Mock AgentConfiguration.findAll to return different statuses
      const mockAgentConfigFindAll = vi
        .spyOn(AgentConfigurationModel, "findAll")
        .mockResolvedValue([
          {
            sId: activeAgentConfig.sId,
            status: "active",
            versionCreatedAt: new Date(),
          } as any,
          {
            sId: archivedAgentConfig.sId,
            status: "archived",
            versionCreatedAt: new Date(),
          } as any,
        ]);

      // Create triggers - some disabled pointing to active agent, some to archived agent, some enabled
      const disabledActiveAgentTrigger = await TriggerResource.makeNew(
        authenticator,
        {
          id: 123,
          workspaceId: workspace.id,
          name: "Disabled Active Agent Trigger",
          kind: "schedule",
          agentConfigurationId: activeAgentConfig.sId,
          editor: authenticator.getNonNullableUser().id,
          customPrompt: null,
          status: "disabled",
          configuration: {
            cron: "0 9 * * 1",
            timezone: "UTC",
          },
          origin: "user",
          executionMode: "user_pool",
        }
      );

      const disabledArchivedAgentTrigger = await TriggerResource.makeNew(
        authenticator,
        {
          id: 124,
          workspaceId: workspace.id,
          name: "Disabled Archived Agent Trigger",
          kind: "schedule",
          agentConfigurationId: archivedAgentConfig.sId,
          editor: authenticator.getNonNullableUser().id,
          customPrompt: null,
          status: "disabled",
          configuration: {
            cron: "0 10 * * 1",
            timezone: "UTC",
          },
          origin: "user",
          executionMode: "user_pool",
        }
      );

      const enabledActiveTrigger = await TriggerResource.makeNew(
        authenticator,
        {
          id: 125,
          workspaceId: workspace.id,
          name: "Already Enabled Trigger",
          kind: "schedule",
          agentConfigurationId: activeAgentConfig.sId,
          editor: authenticator.getNonNullableUser().id,
          customPrompt: null,
          status: "enabled",
          configuration: {
            cron: "0 11 * * 1",
            timezone: "UTC",
          },
          origin: "user",
          executionMode: "user_pool",
        }
      );

      expect(disabledActiveAgentTrigger.isOk()).toBe(true);
      expect(disabledArchivedAgentTrigger.isOk()).toBe(true);
      expect(enabledActiveTrigger.isOk()).toBe(true);

      if (
        disabledActiveAgentTrigger.isErr() ||
        disabledArchivedAgentTrigger.isErr() ||
        enabledActiveTrigger.isErr()
      ) {
        throw new Error("Failed to create test triggers");
      }

      const trigger1 = disabledActiveAgentTrigger.value;
      const trigger2 = disabledArchivedAgentTrigger.value;
      const trigger3 = enabledActiveTrigger.value;

      // Verify initial state
      expect(trigger1.status).toBe("disabled");
      expect(trigger2.status).toBe("disabled");
      expect(trigger3.status).toBe("enabled");

      // Enable all triggers that were manually disabled for the workspace
      const result = await TriggerResource.enableAllForWorkspace(
        authenticator,
        "disabled"
      );

      expect(result.isOk()).toBe(true);

      // Fetch updated triggers to verify correct behavior
      const updatedTrigger1 = await TriggerResource.fetchById(
        authenticator,
        trigger1.sId
      );
      const updatedTrigger2 = await TriggerResource.fetchById(
        authenticator,
        trigger2.sId
      );
      const updatedTrigger3 = await TriggerResource.fetchById(
        authenticator,
        trigger3.sId
      );

      expect(updatedTrigger1).toBeTruthy();
      expect(updatedTrigger2).toBeTruthy();
      expect(updatedTrigger3).toBeTruthy();

      // Disabled trigger pointing to active agent should now be enabled
      expect(updatedTrigger1!.status).toBe("enabled");
      // Disabled trigger pointing to archived agent should remain disabled
      expect(updatedTrigger2!.status).toBe("disabled");
      // Already enabled trigger should remain enabled
      expect(updatedTrigger3!.status).toBe("enabled");

      // Clean up mocks
      mockAgentConfigFindAll.mockRestore();
      mockCreateOrUpdateWorkflow.mockRestore();
      mockDeleteWorkflow.mockRestore();
    });
  });

  describe("disable", () => {
    it("re-attempts schedule removal even when already disabled", async () => {
      const mockCreateOrUpdateWorkflow = vi
        .spyOn(temporalClient, "createOrUpdateAgentSchedule")
        .mockResolvedValue(new Ok("workflow-id"));
      const mockDeleteWorkflow = vi
        .spyOn(temporalClient, "deleteTriggerSchedule")
        .mockResolvedValue(new Ok(undefined));

      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Test Agent" }
      );

      const triggerResult = await TriggerResource.makeNew(authenticator, {
        id: 200,
        workspaceId: workspace.id,
        name: "Schedule Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: authenticator.getNonNullableUser().id,
        customPrompt: null,
        status: "enabled",
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
        origin: "user",
        executionMode: "user_pool",
      });
      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw new Error("Failed to create test trigger");
      }
      const trigger = triggerResult.value;

      // First disable: flips status and removes the schedule.
      const first = await trigger.disable(authenticator);
      expect(first.isOk()).toBe(true);
      expect(trigger.status).toBe("disabled");
      expect(mockDeleteWorkflow).toHaveBeenCalledTimes(1);

      // Second disable on an already-disabled trigger: must still reconcile the
      // Temporal schedule (this is what self-heals an orphaned schedule left by
      // a previously failed removal).
      mockDeleteWorkflow.mockClear();
      const second = await trigger.disable(authenticator);
      expect(second.isOk()).toBe(true);
      expect(mockDeleteWorkflow).toHaveBeenCalledTimes(1);

      mockCreateOrUpdateWorkflow.mockRestore();
      mockDeleteWorkflow.mockRestore();
    });
  });

  describe("disableMany", () => {
    it("reconciles schedules for triggers already at the target status", async () => {
      const mockCreateOrUpdateWorkflow = vi
        .spyOn(temporalClient, "createOrUpdateAgentSchedule")
        .mockResolvedValue(new Ok("workflow-id"));
      const mockDeleteWorkflow = vi
        .spyOn(temporalClient, "deleteTriggerSchedule")
        .mockResolvedValue(new Ok(undefined));

      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Test Agent" }
      );

      // A trigger whose status was already flipped to disabled, but whose
      // schedule removal previously failed and was swallowed.
      const triggerResult = await TriggerResource.makeNew(authenticator, {
        id: 201,
        workspaceId: workspace.id,
        name: "Already Disabled Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: authenticator.getNonNullableUser().id,
        customPrompt: null,
        status: "disabled",
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
        origin: "user",
        executionMode: "user_pool",
      });
      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw new Error("Failed to create test trigger");
      }
      const trigger = triggerResult.value;

      mockDeleteWorkflow.mockClear();

      // disableMany used to early-return when every trigger was already at the
      // target status, leaving the orphaned schedule alive. It must now still
      // reconcile the Temporal schedule.
      const result = await TriggerResource.disableMany(
        authenticator,
        [trigger],
        "disabled"
      );
      expect(result.isOk()).toBe(true);
      expect(mockDeleteWorkflow).toHaveBeenCalledTimes(1);

      mockCreateOrUpdateWorkflow.mockRestore();
      mockDeleteWorkflow.mockRestore();
    });
  });

  describe("countForWorkspace", () => {
    it("counts the workspace's enabled triggers and its total", async () => {
      const mockCreateOrUpdateWorkflow = vi
        .spyOn(temporalClient, "createOrUpdateAgentSchedule")
        .mockResolvedValue(new Ok("workflow-id"));

      const { authenticator } = await createResourceTest({ role: "admin" });
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Test Agent" }
      );

      for (const status of ["enabled", "enabled", "disabled"] as const) {
        await TriggerFactory.schedule(authenticator, {
          agentConfigurationId: agentConfig.sId,
          status,
          configuration: { cron: "0 9 * * 1", timezone: "UTC" },
        });
      }
      await TriggerFactory.webhook(authenticator, {
        agentConfigurationId: agentConfig.sId,
        status: "downgraded",
      });

      expect(await TriggerResource.countForWorkspace(authenticator)).toEqual({
        enabled: 2,
        total: 4,
        workspacePool: 0,
      });

      mockCreateOrUpdateWorkflow.mockRestore();
    });

    it("counts zero for a workspace without triggers", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      expect(await TriggerResource.countForWorkspace(authenticator)).toEqual({
        enabled: 0,
        total: 0,
        workspacePool: 0,
      });
    });
  });
  describe("setExecutionMode", () => {
    it("refuses the workspace pool without the governance grant", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Test Agent" }
      );
      const trigger = await TriggerFactory.webhook(authenticator, {
        agentConfigurationId: agentConfig.sId,
      });

      const result = await trigger.setExecutionMode(
        authenticator,
        "workspace_pool"
      );

      expect(result.isErr()).toBe(true);
      const reloaded = await TriggerResource.fetchById(
        authenticator,
        trigger.sId
      );
      expect(reloaded?.executionMode).toBe("user_pool");
    });

    it("refuses a member who neither manages nor edits the trigger", async () => {
      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Test Agent" }
      );
      const trigger = await TriggerFactory.webhook(authenticator, {
        agentConfigurationId: agentConfig.sId,
        executionMode: "workspace_pool",
      });

      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const result = await trigger.setExecutionMode(otherAuth, "user_pool");

      expect(result.isErr()).toBe(true);
      const reloaded = await TriggerResource.fetchById(
        authenticator,
        trigger.sId
      );
      expect(reloaded?.executionMode).toBe("workspace_pool");
    });

    it("lets an admin move a trigger to the workspace pool", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Test Agent" }
      );
      const trigger = await TriggerFactory.webhook(authenticator, {
        agentConfigurationId: agentConfig.sId,
      });

      const result = await trigger.setExecutionMode(
        authenticator,
        "workspace_pool"
      );

      expect(result.isOk()).toBe(true);
      const reloaded = await TriggerResource.fetchById(
        authenticator,
        trigger.sId
      );
      expect(reloaded?.executionMode).toBe("workspace_pool");
    });
  });

  describe("transferEditor", () => {
    it("moves the triggers and re-registers enabled schedules for the new editor", async () => {
      const mockCreateOrUpdateWorkflow = vi
        .spyOn(temporalClient, "createOrUpdateAgentSchedule")
        .mockResolvedValue(new Ok("workflow-id"));

      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Test Agent" }
      );

      const primaryUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, primaryUser, {
        role: "user",
      });
      const secondaryUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, secondaryUser, {
        role: "user",
      });
      const secondaryAuth = await Authenticator.fromUserIdAndWorkspaceId(
        secondaryUser.sId,
        workspace.sId
      );

      const enabledTrigger = await TriggerFactory.schedule(secondaryAuth, {
        agentConfigurationId: agentConfig.sId,
        status: "enabled",
        configuration: { cron: "0 9 * * 1", timezone: "UTC" },
      });
      const disabledTrigger = await TriggerFactory.schedule(secondaryAuth, {
        agentConfigurationId: agentConfig.sId,
        configuration: { cron: "0 10 * * 1", timezone: "UTC" },
      });
      mockCreateOrUpdateWorkflow.mockClear();

      const result = await TriggerResource.transferEditor(authenticator, {
        fromUser: secondaryUser,
        toUser: primaryUser,
      });

      expect(result.isOk()).toBe(true);
      for (const trigger of [enabledTrigger, disabledTrigger]) {
        const reloaded = await TriggerResource.fetchById(
          authenticator,
          trigger.sId
        );
        expect(reloaded?.editor).toBe(primaryUser.id);
      }

      // Only the enabled schedule has a live Temporal schedule to re-point, and it must be
      // re-registered as the new editor: the schedule bakes the editor's sId into its args.
      expect(mockCreateOrUpdateWorkflow).toHaveBeenCalledTimes(1);
      const [{ auth: scheduleAuth, trigger: scheduledTrigger }] =
        mockCreateOrUpdateWorkflow.mock.calls[0];
      expect(scheduleAuth.getNonNullableUser().id).toBe(primaryUser.id);
      expect(scheduledTrigger.sId).toBe(enabledTrigger.sId);
      // The resource must carry the new editor too: `createOrUpdateAgentSchedule` silently skips
      // triggers whose `editor` does not match the caller.
      expect(scheduledTrigger.editor).toBe(primaryUser.id);
    });

    it("leaves the other members' triggers untouched", async () => {
      vi.spyOn(temporalClient, "createOrUpdateAgentSchedule").mockResolvedValue(
        new Ok("workflow-id")
      );

      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Test Agent" }
      );

      const adminTrigger = await TriggerFactory.schedule(authenticator, {
        agentConfigurationId: agentConfig.sId,
        configuration: { cron: "0 11 * * 1", timezone: "UTC" },
      });

      const primaryUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, primaryUser, {
        role: "user",
      });
      const secondaryUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, secondaryUser, {
        role: "user",
      });

      const result = await TriggerResource.transferEditor(authenticator, {
        fromUser: secondaryUser,
        toUser: primaryUser,
      });

      expect(result.isOk()).toBe(true);
      const reloaded = await TriggerResource.fetchById(
        authenticator,
        adminTrigger.sId
      );
      expect(reloaded?.editor).toBe(authenticator.getNonNullableUser().id);
    });
  });
});
