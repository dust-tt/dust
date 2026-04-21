import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import * as temporalClient from "@app/temporal/triggers/schedule_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
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
});
