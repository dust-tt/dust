import { describe, expect, it, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { TriggerSubscriberModel } from "@app/lib/models/assistant/triggers/trigger_subscriber";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import * as temporalClient from "@app/temporal/agent_schedule/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types";

describe("TriggerResource", () => {
  describe("addToSubscribers", () => {
    it("should successfully add user to subscribers", async () => {
      const {
        workspace,
        authenticator: editorAuth,
        user: editorUser,
      } = await createResourceTest({
        role: "admin",
      });

      // Create a second user who will be the subscriber
      const subscriberUser = await UserFactory.basic();
      const subscriberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        subscriberUser.sId,
        workspace.sId
      );

      // Create an agent configuration for the trigger
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        editorAuth,
        { name: "Test Agent" }
      );

      // Create a trigger with editorUser as the editor
      const triggerResult = await TriggerResource.makeNew(editorAuth, {
        id: 123,
        workspaceId: workspace.id,
        name: "Test Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: editorUser.id,
        customPrompt: null,
        enabled: true,
        configuration: {
          cron: "0 9 * * 1", // Every Monday at 9 AM
          timezone: "UTC",
        },
      });

      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw triggerResult.error;
      }

      const trigger = triggerResult.value;

      // Add subscriber user to subscribers (not the editor)
      const result = await trigger.addToSubscribers(subscriberAuth);

      expect(result.isOk()).toBe(true);

      // Verify the subscription was created
      const subscription = await TriggerSubscriberModel.findOne({
        where: {
          workspaceId: workspace.id,
          triggerId: trigger.id,
          userId: subscriberUser.id,
        },
      });

      expect(subscription).toBeTruthy();
      expect(subscription?.workspaceId).toBe(workspace.id);
      expect(subscription?.triggerId).toBe(trigger.id);
      expect(subscription?.userId).toBe(subscriberUser.id);
    });

    it("should return internal_error error when editor tries to subscribe to their own trigger", async () => {
      const { workspace, authenticator, user } = await createResourceTest({
        role: "admin",
      });

      // Create an agent configuration for the trigger
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Test Agent" }
      );

      // Create a trigger with user as the editor
      const triggerResult = await TriggerResource.makeNew(authenticator, {
        id: 123,
        workspaceId: workspace.id,
        name: "Test Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: user.id,
        customPrompt: null,
        enabled: true,
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
      });

      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw triggerResult.error;
      }

      const trigger = triggerResult.value;

      // Try to add editor as subscriber (should fail)
      const result = await trigger.addToSubscribers(authenticator);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(DustError);
        expect(result.error.code).toBe("internal_error");
        expect(result.error.message).toBe("User is the editor of the trigger");
      }
    });

    it("should return unauthorized error when user tries to subscribe to trigger in different workspace", async () => {
      const {
        workspace: workspace1,
        authenticator: auth1,
        user: user1,
      } = await createResourceTest({ role: "admin" });
      const { authenticator: auth2 } = await createResourceTest({
        role: "admin",
      });

      // Create an agent configuration in workspace1
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth1,
        { name: "Test Agent" }
      );

      // Create a trigger in workspace1
      const triggerResult = await TriggerResource.makeNew(auth1, {
        id: 123,
        workspaceId: workspace1.id,
        name: "Test Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: user1.id,
        customPrompt: null,
        enabled: true,
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
      });

      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw triggerResult.error;
      }

      const trigger = triggerResult.value;

      // Try to add user from workspace2 to subscribers
      const result = await trigger.addToSubscribers(auth2);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(DustError);
        expect(result.error.code).toBe("unauthorized");
        expect(result.error.message).toBe(
          "User do not have access to this trigger"
        );
      }
    });

    it("should handle database errors gracefully", async () => {
      const {
        workspace,
        authenticator: editorAuth,
        user: editorUser,
      } = await createResourceTest({
        role: "admin",
      });

      // Create a second user who will be the subscriber
      const subscriberUser = await UserFactory.basic();
      const subscriberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        subscriberUser.sId,
        workspace.sId
      );

      // Create an agent configuration for the trigger
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        editorAuth,
        { name: "Test Agent" }
      );

      // Create a trigger
      const triggerResult = await TriggerResource.makeNew(editorAuth, {
        id: 123,
        workspaceId: workspace.id,
        name: "Test Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: editorUser.id,
        customPrompt: null,
        enabled: true,
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
      });

      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw triggerResult.error;
      }

      const trigger = triggerResult.value;

      // Mock TriggerSubscriberModel.create to throw an error
      const mockCreate = vi
        .spyOn(TriggerSubscriberModel, "create")
        .mockRejectedValue(new Error("Database connection failed"));

      const result = await trigger.addToSubscribers(subscriberAuth);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(DustError);
        expect(result.error.code).toBe("internal_error");
        expect(result.error.message).toBe("Database connection failed");
      }

      // Restore the original method
      mockCreate.mockRestore();
    });

    it("should handle duplicate subscription attempts", async () => {
      const {
        workspace,
        authenticator: editorAuth,
        user: editorUser,
      } = await createResourceTest({
        role: "admin",
      });

      // Create a second user who will be the subscriber
      const subscriberUser = await UserFactory.basic();
      const subscriberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        subscriberUser.sId,
        workspace.sId
      );

      // Create an agent configuration for the trigger
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        editorAuth,
        { name: "Test Agent" }
      );

      // Create a trigger
      const triggerResult = await TriggerResource.makeNew(editorAuth, {
        id: 123,
        workspaceId: workspace.id,
        name: "Test Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: editorUser.id,
        customPrompt: null,
        enabled: true,
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
      });

      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw triggerResult.error;
      }

      const trigger = triggerResult.value;

      // Add subscriber to subscribers first time
      const result1 = await trigger.addToSubscribers(subscriberAuth);
      expect(result1.isOk()).toBe(true);

      // Try to add the same user again - should handle gracefully
      const result2 = await trigger.addToSubscribers(subscriberAuth);

      // This should either succeed (idempotent) or fail with a specific error
      // depending on database constraints. Since we have a unique index,
      // it should fail with an internal_error
      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error).toBeInstanceOf(DustError);
        expect(result2.error.code).toBe("internal_error");
      }
    });
  });

  describe("removeFromSubscribers", () => {
    it("should successfully remove user from subscribers", async () => {
      const {
        workspace,
        authenticator: editorAuth,
        user: editorUser,
      } = await createResourceTest({
        role: "admin",
      });

      // Create a second user who will be the subscriber
      const subscriberUser = await UserFactory.basic();
      const subscriberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        subscriberUser.sId,
        workspace.sId
      );

      // Create an agent configuration for the trigger
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        editorAuth,
        { name: "Test Agent" }
      );

      // Create a trigger
      const triggerResult = await TriggerResource.makeNew(editorAuth, {
        id: 123,
        workspaceId: workspace.id,
        name: "Test Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: editorUser.id,
        customPrompt: null,
        enabled: true,
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
      });

      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw triggerResult.error;
      }

      const trigger = triggerResult.value;

      // First, add subscriber to subscribers
      const addResult = await trigger.addToSubscribers(subscriberAuth);
      expect(addResult.isOk()).toBe(true);

      // Verify subscription exists
      const subscriptionBefore = await TriggerSubscriberModel.findOne({
        where: {
          workspaceId: workspace.id,
          triggerId: trigger.id,
          userId: subscriberUser.id,
        },
      });
      expect(subscriptionBefore).toBeTruthy();

      // Remove subscriber from subscribers
      const result = await trigger.removeFromSubscribers(subscriberAuth);

      expect(result.isOk()).toBe(true);

      // Verify the subscription was removed
      const subscriptionAfter = await TriggerSubscriberModel.findOne({
        where: {
          workspaceId: workspace.id,
          triggerId: trigger.id,
          userId: subscriberUser.id,
        },
      });

      expect(subscriptionAfter).toBeNull();
    });

    it("should return unauthorized error when user tries to unsubscribe from trigger in different workspace", async () => {
      const {
        workspace: workspace1,
        authenticator: auth1,
        user: user1,
      } = await createResourceTest({ role: "admin" });
      const { authenticator: auth2 } = await createResourceTest({
        role: "admin",
      });

      // Create an agent configuration in workspace1
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth1,
        { name: "Test Agent" }
      );

      // Create a trigger in workspace1
      const triggerResult = await TriggerResource.makeNew(auth1, {
        id: 123,
        workspaceId: workspace1.id,
        name: "Test Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: user1.id,
        customPrompt: null,
        enabled: true,
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
      });

      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw triggerResult.error;
      }

      const trigger = triggerResult.value;

      // Try to remove user from workspace2 from subscribers
      const result = await trigger.removeFromSubscribers(auth2);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(DustError);
        expect(result.error.code).toBe("unauthorized");
        expect(result.error.message).toBe(
          "User do not have access to this trigger"
        );
      }
    });

    it("should handle database errors gracefully", async () => {
      const {
        workspace,
        authenticator: editorAuth,
        user: editorUser,
      } = await createResourceTest({
        role: "admin",
      });

      // Create a second user who will be the subscriber
      const subscriberUser = await UserFactory.basic();
      const subscriberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        subscriberUser.sId,
        workspace.sId
      );

      // Create an agent configuration for the trigger
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        editorAuth,
        { name: "Test Agent" }
      );

      // Create a trigger
      const triggerResult = await TriggerResource.makeNew(editorAuth, {
        id: 123,
        workspaceId: workspace.id,
        name: "Test Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: editorUser.id,
        customPrompt: null,
        enabled: true,
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
      });

      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw triggerResult.error;
      }

      const trigger = triggerResult.value;

      // Mock TriggerSubscriberModel.destroy to throw an error
      const mockDestroy = vi
        .spyOn(TriggerSubscriberModel, "destroy")
        .mockRejectedValue(new Error("Database connection failed"));

      const result = await trigger.removeFromSubscribers(subscriberAuth);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(DustError);
        expect(result.error.code).toBe("internal_error");
        expect(result.error.message).toBe("Database connection failed");
      }

      // Restore the original method
      mockDestroy.mockRestore();
    });

    it("should handle removing non-existent subscription gracefully", async () => {
      const {
        workspace,
        authenticator: editorAuth,
        user: editorUser,
      } = await createResourceTest({
        role: "admin",
      });

      // Create a second user who will be the subscriber
      const subscriberUser = await UserFactory.basic();
      const subscriberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        subscriberUser.sId,
        workspace.sId
      );

      // Create an agent configuration for the trigger
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        editorAuth,
        { name: "Test Agent" }
      );

      // Create a trigger
      const triggerResult = await TriggerResource.makeNew(editorAuth, {
        id: 123,
        workspaceId: workspace.id,
        name: "Test Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: editorUser.id,
        customPrompt: null,
        enabled: true,
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
      });

      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw triggerResult.error;
      }

      const trigger = triggerResult.value;

      // Try to remove subscriber from subscribers without adding them first
      const result = await trigger.removeFromSubscribers(subscriberAuth);

      // This should succeed (be idempotent) even if no subscription exists
      expect(result.isOk()).toBe(true);

      // Verify no subscription exists
      const subscription = await TriggerSubscriberModel.findOne({
        where: {
          workspaceId: workspace.id,
          triggerId: trigger.id,
          userId: subscriberUser.id,
        },
      });

      expect(subscription).toBeNull();
    });
  });

  describe("cross-user scenarios", () => {
    it("should allow different users in same workspace to manage their own subscriptions independently", async () => {
      const {
        workspace,
        authenticator: editorAuth,
        user: editorUser,
      } = await createResourceTest({ role: "admin" });

      // Create two additional users who will be subscribers
      const subscriber1 = await UserFactory.basic();
      const auth1 = await Authenticator.fromUserIdAndWorkspaceId(
        subscriber1.sId,
        workspace.sId
      );

      const subscriber2 = await UserFactory.basic();
      const auth2 = await Authenticator.fromUserIdAndWorkspaceId(
        subscriber2.sId,
        workspace.sId
      );

      // Create an agent configuration for the trigger
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        editorAuth,
        { name: "Test Agent" }
      );

      // Create a trigger with editorUser as the editor
      const triggerResult = await TriggerResource.makeNew(editorAuth, {
        id: 123,
        workspaceId: workspace.id,
        name: "Test Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: editorUser.id,
        customPrompt: null,
        enabled: true,
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
      });

      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw triggerResult.error;
      }

      const trigger = triggerResult.value;

      // Both subscribers subscribe to the trigger (editor cannot subscribe)
      const result1 = await trigger.addToSubscribers(auth1);
      const result2 = await trigger.addToSubscribers(auth2);

      expect(result1.isOk()).toBe(true);
      expect(result2.isOk()).toBe(true);

      // Verify both subscriptions exist
      const subscription1 = await TriggerSubscriberModel.findOne({
        where: {
          workspaceId: workspace.id,
          triggerId: trigger.id,
          userId: subscriber1.id,
        },
      });

      const subscription2 = await TriggerSubscriberModel.findOne({
        where: {
          workspaceId: workspace.id,
          triggerId: trigger.id,
          userId: subscriber2.id,
        },
      });

      expect(subscription1).toBeTruthy();
      expect(subscription2).toBeTruthy();

      // Subscriber1 unsubscribes
      const removeResult1 = await trigger.removeFromSubscribers(auth1);
      expect(removeResult1.isOk()).toBe(true);

      // Verify only subscriber1's subscription was removed
      const subscription1After = await TriggerSubscriberModel.findOne({
        where: {
          workspaceId: workspace.id,
          triggerId: trigger.id,
          userId: subscriber1.id,
        },
      });

      const subscription2After = await TriggerSubscriberModel.findOne({
        where: {
          workspaceId: workspace.id,
          triggerId: trigger.id,
          userId: subscriber2.id,
        },
      });

      expect(subscription1After).toBeNull();
      expect(subscription2After).toBeTruthy();
    });
  });

  describe("disableAllForWorkspace", () => {
    it("should successfully disable all enabled triggers in a workspace", async () => {
      // Mock temporal workflow operations to avoid failures in test environment
      const mockCreateOrUpdateWorkflow = vi
        .spyOn(temporalClient, "createOrUpdateAgentScheduleWorkflow")
        .mockResolvedValue(new Ok(undefined));
      const mockDeleteWorkflow = vi
        .spyOn(temporalClient, "deleteAgentScheduleWorkflow")
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
        enabled: true,
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
      });

      const trigger2Result = await TriggerResource.makeNew(authenticator, {
        id: 124,
        workspaceId: workspace.id,
        name: "Enabled Trigger 2",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: authenticator.getNonNullableUser().id,
        customPrompt: null,
        enabled: true,
        configuration: {
          cron: "0 10 * * 1",
          timezone: "UTC",
        },
      });

      const trigger3Result = await TriggerResource.makeNew(authenticator, {
        id: 125,
        workspaceId: workspace.id,
        name: "Disabled Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: authenticator.getNonNullableUser().id,
        customPrompt: null,
        enabled: false,
        configuration: {
          cron: "0 11 * * 1",
          timezone: "UTC",
        },
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
      expect(trigger1.enabled).toBe(true);
      expect(trigger2.enabled).toBe(true);
      expect(trigger3.enabled).toBe(false);

      // Disable all triggers for the workspace
      const result =
        await TriggerResource.disableAllForWorkspace(authenticator);

      expect(result.isOk()).toBe(true);

      // Fetch updated triggers to verify they were disabled
      const updatedTrigger1 = await TriggerResource.fetchById(
        authenticator,
        trigger1.sId()
      );
      const updatedTrigger2 = await TriggerResource.fetchById(
        authenticator,
        trigger2.sId()
      );
      const updatedTrigger3 = await TriggerResource.fetchById(
        authenticator,
        trigger3.sId()
      );

      expect(updatedTrigger1).toBeTruthy();
      expect(updatedTrigger2).toBeTruthy();
      expect(updatedTrigger3).toBeTruthy();

      // Previously enabled triggers should now be disabled
      expect(updatedTrigger1!.enabled).toBe(false);
      expect(updatedTrigger2!.enabled).toBe(false);
      // Previously disabled trigger should remain disabled
      expect(updatedTrigger3!.enabled).toBe(false);

      // Clean up mocks
      mockCreateOrUpdateWorkflow.mockRestore();
      mockDeleteWorkflow.mockRestore();
    });

    it("should return success when no triggers exist in workspace", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
      });

      // Try to disable all triggers in a workspace with no triggers
      const result =
        await TriggerResource.disableAllForWorkspace(authenticator);

      expect(result.isOk()).toBe(true);
    });

    it("should return success when no enabled triggers exist in workspace", async () => {
      // Mock temporal workflow operations
      const mockCreateOrUpdateWorkflow = vi
        .spyOn(temporalClient, "createOrUpdateAgentScheduleWorkflow")
        .mockResolvedValue(new Ok(undefined));
      const mockDeleteWorkflow = vi
        .spyOn(temporalClient, "deleteAgentScheduleWorkflow")
        .mockResolvedValue(new Ok(undefined));

      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      // Create an agent configuration
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Test Agent" }
      );

      // Create only disabled triggers
      const triggerResult = await TriggerResource.makeNew(authenticator, {
        id: 123,
        workspaceId: workspace.id,
        name: "Already Disabled Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: authenticator.getNonNullableUser().id,
        customPrompt: null,
        enabled: false,
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
      });

      expect(triggerResult.isOk()).toBe(true);

      // Try to disable all triggers (should succeed even though none are enabled)
      const result =
        await TriggerResource.disableAllForWorkspace(authenticator);

      expect(result.isOk()).toBe(true);

      // Clean up mocks
      mockCreateOrUpdateWorkflow.mockRestore();
      mockDeleteWorkflow.mockRestore();
    });

    it("should handle errors when individual trigger disabling fails", async () => {
      // Mock temporal workflow operations
      const mockCreateOrUpdateWorkflow = vi
        .spyOn(temporalClient, "createOrUpdateAgentScheduleWorkflow")
        .mockResolvedValue(new Ok(undefined));
      const mockDeleteWorkflow = vi
        .spyOn(temporalClient, "deleteAgentScheduleWorkflow")
        .mockResolvedValue(new Ok(undefined));

      const { workspace, authenticator } = await createResourceTest({
        role: "admin",
      });

      // Create an agent configuration
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Test Agent" }
      );

      // Create an enabled trigger
      const triggerResult = await TriggerResource.makeNew(authenticator, {
        id: 123,
        workspaceId: workspace.id,
        name: "Test Trigger",
        kind: "schedule",
        agentConfigurationId: agentConfig.sId,
        editor: authenticator.getNonNullableUser().id,
        customPrompt: null,
        enabled: true,
        configuration: {
          cron: "0 9 * * 1",
          timezone: "UTC",
        },
      });

      expect(triggerResult.isOk()).toBe(true);
      if (triggerResult.isErr()) {
        throw triggerResult.error;
      }

      const trigger = triggerResult.value;

      // Mock the disable method to fail
      const mockDisable = vi.spyOn(trigger, "disable").mockResolvedValue({
        isErr: () => true,
        error: new Error("Failed to disable trigger"),
      } as any);

      // Mock listByWorkspace to return our trigger
      const mockListByWorkspace = vi
        .spyOn(TriggerResource, "listByWorkspace")
        .mockResolvedValue([trigger]);

      const result =
        await TriggerResource.disableAllForWorkspace(authenticator);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          "Failed to disable 1 some triggers"
        );
      }

      // Restore mocks
      mockDisable.mockRestore();
      mockListByWorkspace.mockRestore();
      mockCreateOrUpdateWorkflow.mockRestore();
      mockDeleteWorkflow.mockRestore();
    });
  });
});
