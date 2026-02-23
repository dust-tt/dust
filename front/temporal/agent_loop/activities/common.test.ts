import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentMessageSuccessEvent } from "@app/types/assistant/agent";
import { beforeEach, describe, expect, it } from "vitest";
import {
  processEventForDatabase,
  updateAgentMessageDBAndMemory,
} from "./common";

// Helper to create an event with runIds for testing
function createEventWithRunIds(
  baseEvent: AgentMessageSuccessEvent,
  runIds: string[]
): AgentMessageEvents {
  return {
    ...baseEvent,
    runIds,
  } as AgentMessageEvents;
}

describe("processEventForDatabase", () => {
  let auth: Awaited<ReturnType<typeof createResourceTest>>["authenticator"];
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;
  });

  describe("modelInteractionDurationMs", () => {
    it("should accumulate modelInteractionDurationMs when provided", async () => {
      // Arrange: Create agent message and conversation
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Verify initial state
      const initialMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(initialMessage?.modelInteractionDurationMs).toBeNull();

      // Act: Process event with modelInteractionDurationMs
      const event: AgentMessageSuccessEvent = {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfig.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [],
      };

      await processEventForDatabase(auth, {
        event,
        agentMessage,
        step: 0,
        conversation,
        modelInteractionDurationMs: 100,
      });

      // Assert: Duration should be accumulated
      const updatedMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(updatedMessage?.modelInteractionDurationMs).toBe(100);
    });

    it("should accumulate modelInteractionDurationMs on top of existing value", async () => {
      // Arrange: Create agent message with existing duration
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Set initial duration
      await AgentMessageModel.update(
        { modelInteractionDurationMs: 50 },
        { where: { id: agentMessage.agentMessageId } }
      );

      // Act: Process event with additional duration
      const event: AgentMessageSuccessEvent = {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfig.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [],
      };

      await processEventForDatabase(auth, {
        event,
        agentMessage,
        step: 0,
        conversation,
        modelInteractionDurationMs: 75,
      });

      // Assert: Duration should be accumulated (50 + 75 = 125)
      const updatedMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(updatedMessage?.modelInteractionDurationMs).toBe(125);
    });

    it("should round modelInteractionDurationMs to nearest integer", async () => {
      // Arrange: Create agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Act: Process event with non-integer duration
      const event: AgentMessageSuccessEvent = {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfig.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [],
      };

      await processEventForDatabase(auth, {
        event,
        agentMessage,
        step: 0,
        conversation,
        modelInteractionDurationMs: 99.7,
      });

      // Assert: Duration should be rounded to 100
      const updatedMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(updatedMessage?.modelInteractionDurationMs).toBe(100);
    });

    it("should not update modelInteractionDurationMs when not provided", async () => {
      // Arrange: Create agent message with existing duration
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Set initial duration
      await AgentMessageModel.update(
        { modelInteractionDurationMs: 100 },
        { where: { id: agentMessage.agentMessageId } }
      );

      // Act: Process event without modelInteractionDurationMs
      const event: AgentMessageSuccessEvent = {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfig.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [],
      };

      await processEventForDatabase(auth, {
        event,
        agentMessage,
        step: 0,
        conversation,
      });

      // Assert: Duration should remain unchanged
      const updatedMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(updatedMessage?.modelInteractionDurationMs).toBe(100);
    });
  });

  describe("runIds", () => {
    it("should merge runIds when event contains runIds", async () => {
      // Arrange: Create agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Verify initial state
      const initialMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(initialMessage?.runIds).toBeNull();

      // Act: Process event with runIds
      const baseEvent: AgentMessageSuccessEvent = {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfig.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [],
      };
      const event = createEventWithRunIds(baseEvent, ["run1", "run2"]);

      await processEventForDatabase(auth, {
        event,
        agentMessage,
        step: 0,
        conversation,
      });

      // Assert: runIds should be merged
      const updatedMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(updatedMessage?.runIds).toEqual(["run1", "run2"]);
    });

    it("should merge runIds with existing runIds", async () => {
      // Arrange: Create agent message with existing runIds
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Set initial runIds
      await AgentMessageModel.update(
        { runIds: ["run1", "run2"] },
        { where: { id: agentMessage.agentMessageId } }
      );

      // Act: Process event with additional runIds
      const baseEvent: AgentMessageSuccessEvent = {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfig.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [],
      };
      const event = createEventWithRunIds(baseEvent, ["run2", "run3"]);

      await processEventForDatabase(auth, {
        event,
        agentMessage,
        step: 0,
        conversation,
      });

      // Assert: runIds should be merged and deduplicated
      const updatedMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(updatedMessage?.runIds).toEqual(
        expect.arrayContaining(["run1", "run2", "run3"])
      );
      expect(updatedMessage?.runIds?.length).toBe(3);
    });

    it("should not update runIds when event does not contain runIds", async () => {
      // Arrange: Create agent message with existing runIds
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Set initial runIds
      await AgentMessageModel.update(
        { runIds: ["run1", "run2"] },
        { where: { id: agentMessage.agentMessageId } }
      );

      // Act: Process event without runIds
      const event: AgentMessageSuccessEvent = {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfig.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [],
      };

      await processEventForDatabase(auth, {
        event,
        agentMessage,
        step: 0,
        conversation,
      });

      // Assert: runIds should remain unchanged
      const updatedMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(updatedMessage?.runIds).toEqual(["run1", "run2"]);
    });

    it("should not update runIds when event has empty runIds array", async () => {
      // Arrange: Create agent message with existing runIds
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Set initial runIds
      await AgentMessageModel.update(
        { runIds: ["run1", "run2"] },
        { where: { id: agentMessage.agentMessageId } }
      );

      // Act: Process event with empty runIds array
      const baseEvent: AgentMessageSuccessEvent = {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfig.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [],
      };
      const event = createEventWithRunIds(baseEvent, []);

      await processEventForDatabase(auth, {
        event,
        agentMessage,
        step: 0,
        conversation,
      });

      // Assert: runIds should remain unchanged
      const updatedMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(updatedMessage?.runIds).toEqual(["run1", "run2"]);
    });
  });

  describe("combined updates", () => {
    it("should update both modelInteractionDurationMs and runIds in the same call", async () => {
      // Arrange: Create agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Act: Process event with both modelInteractionDurationMs and runIds
      const baseEvent: AgentMessageSuccessEvent = {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentConfig.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [],
      };
      const event = createEventWithRunIds(baseEvent, ["run1", "run2"]);

      await processEventForDatabase(auth, {
        event,
        agentMessage,
        step: 0,
        conversation,
        modelInteractionDurationMs: 150,
      });

      // Assert: Both should be updated
      const updatedMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(updatedMessage?.modelInteractionDurationMs).toBe(150);
      expect(updatedMessage?.runIds).toEqual(["run1", "run2"]);
    });
  });
});

describe("updateAgentMessageDBAndMemory", () => {
  let auth: Awaited<ReturnType<typeof createResourceTest>>["authenticator"];
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;
  });

  describe("error update", () => {
    it("should update status to failed and set error fields", async () => {
      // Arrange: Create agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Verify initial state
      expect(agentMessage.status).toBe("created");
      expect(agentMessage.completedTs).toBeNull();
      expect(agentMessage.error).toBeNull();

      const error = {
        code: "test_error",
        message: "Test error message",
        metadata: { category: "test_category" },
      };

      // Act: Update with error
      await updateAgentMessageDBAndMemory(auth, {
        agentMessage,
        update: {
          type: "error",
          error,
        },
      });

      // Assert: Database should be updated
      const dbMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(dbMessage?.status).toBe("failed");
      expect(dbMessage?.errorCode).toBe("test_error");
      expect(dbMessage?.errorMessage).toBe("Test error message");
      expect(dbMessage?.errorMetadata).toEqual({ category: "test_category" });
      expect(dbMessage?.completedAt).toBeDefined();

      // Assert: In-memory object should be updated
      expect(agentMessage.status).toBe("failed");
      expect(agentMessage.completedTs).toBeDefined();
      expect(agentMessage.error).toEqual(error);
    });
  });

  describe("status update", () => {
    it("should update status to succeeded", async () => {
      // Arrange: Create agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Verify initial state
      expect(agentMessage.status).toBe("created");
      expect(agentMessage.completedTs).toBeNull();

      // Act: Update status to succeeded
      await updateAgentMessageDBAndMemory(auth, {
        agentMessage,
        update: {
          type: "status",
          status: "succeeded",
        },
      });

      // Assert: Database should be updated
      const dbMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(dbMessage?.status).toBe("succeeded");
      expect(dbMessage?.completedAt).toBeDefined();

      // Assert: In-memory object should be updated
      expect(agentMessage.status).toBe("succeeded");
      expect(agentMessage.completedTs).toBeDefined();
    });

    it("should update status to cancelled", async () => {
      // Arrange: Create agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Act: Update status to cancelled
      await updateAgentMessageDBAndMemory(auth, {
        agentMessage,
        update: {
          type: "status",
          status: "cancelled",
        },
      });

      // Assert: Database should be updated
      const dbMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(dbMessage?.status).toBe("cancelled");
      expect(dbMessage?.completedAt).toBeDefined();

      // Assert: In-memory object should be updated
      expect(agentMessage.status).toBe("cancelled");
      expect(agentMessage.completedTs).toBeDefined();
    });
  });

  describe("modelInteractionDurationMs update", () => {
    it("should accumulate modelInteractionDurationMs from null", async () => {
      // Arrange: Create agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Verify initial state
      expect(agentMessage.modelInteractionDurationMs).toBeNull();

      // Act: Update with duration
      await updateAgentMessageDBAndMemory(auth, {
        agentMessage,
        update: {
          type: "modelInteractionDurationMs",
          modelInteractionDurationMs: 100,
        },
      });

      // Assert: Database should be updated
      const dbMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(dbMessage?.modelInteractionDurationMs).toBe(100);

      // Assert: In-memory object should be updated
      expect(agentMessage.modelInteractionDurationMs).toBe(100);
    });

    it("should accumulate modelInteractionDurationMs on top of existing value", async () => {
      // Arrange: Create agent message with existing duration
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Set initial duration in DB and memory
      await AgentMessageModel.update(
        { modelInteractionDurationMs: 50 },
        { where: { id: agentMessage.agentMessageId } }
      );
      agentMessage.modelInteractionDurationMs = 50;

      // Act: Update with additional duration
      await updateAgentMessageDBAndMemory(auth, {
        agentMessage,
        update: {
          type: "modelInteractionDurationMs",
          modelInteractionDurationMs: 75,
        },
      });

      // Assert: Database should be accumulated (50 + 75 = 125)
      const dbMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(dbMessage?.modelInteractionDurationMs).toBe(125);

      // Assert: In-memory object should be accumulated
      expect(agentMessage.modelInteractionDurationMs).toBe(125);
    });

    it("should round modelInteractionDurationMs to nearest integer", async () => {
      // Arrange: Create agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Act: Update with non-integer duration
      await updateAgentMessageDBAndMemory(auth, {
        agentMessage,
        update: {
          type: "modelInteractionDurationMs",
          modelInteractionDurationMs: 99.7,
        },
      });

      // Assert: Database should be rounded to 100
      const dbMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(dbMessage?.modelInteractionDurationMs).toBe(100);

      // Assert: In-memory object should be rounded
      expect(agentMessage.modelInteractionDurationMs).toBe(100);
    });
  });

  describe("runIds update", () => {
    it("should merge runIds from empty array", async () => {
      // Arrange: Create agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Verify initial state
      const initialMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(initialMessage?.runIds).toBeNull();

      // Act: Update with runIds
      await updateAgentMessageDBAndMemory(auth, {
        agentMessage,
        update: {
          type: "runIds",
          runIds: ["run1", "run2"],
        },
      });

      // Assert: Database should be updated
      const dbMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(dbMessage?.runIds).toEqual(
        expect.arrayContaining(["run1", "run2"])
      );
      expect(dbMessage?.runIds?.length).toBe(2);
    });

    it("should merge runIds with existing runIds and deduplicate", async () => {
      // Arrange: Create agent message with existing runIds
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Set initial runIds
      await AgentMessageModel.update(
        { runIds: ["run1", "run2"] },
        { where: { id: agentMessage.agentMessageId } }
      );

      // Act: Update with additional runIds (including duplicate)
      await updateAgentMessageDBAndMemory(auth, {
        agentMessage,
        update: {
          type: "runIds",
          runIds: ["run2", "run3"],
        },
      });

      // Assert: Database should be merged and deduplicated
      const dbMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(dbMessage?.runIds).toEqual(
        expect.arrayContaining(["run1", "run2", "run3"])
      );
      expect(dbMessage?.runIds?.length).toBe(3);
    });
  });

  describe("prunedContext update", () => {
    it("should update prunedContext to true", async () => {
      // Arrange: Create agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      });
      const { agentMessage } = await ConversationFactory.createAgentMessage({
        workspace,
        conversation,
        agentConfig,
      });

      // Verify initial state
      expect(agentMessage.prunedContext).toBeUndefined();

      // Act: Update prunedContext
      await updateAgentMessageDBAndMemory(auth, {
        agentMessage,
        update: {
          type: "prunedContext",
          prunedContext: true,
        },
      });

      // Assert: Database should be updated
      const dbMessage = await AgentMessageModel.findOne({
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: workspace.id,
        },
      });
      expect(dbMessage?.prunedContext).toBe(true);

      // Assert: In-memory object should be updated
      expect(agentMessage.prunedContext).toBe(true);
    });
  });
});
