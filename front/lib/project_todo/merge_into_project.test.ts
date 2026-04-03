import { Authenticator } from "@app/lib/auth";
import {
  PROJECT_TODO_AGENT_CONFIGURATION_ID,
  mergeConversationTodosIntoProject,
} from "@app/lib/project_todo/merge_into_project";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationTodoVersionedResource } from "@app/lib/resources/conversation_todo_versioned_resource";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { TodoVersionedActionItem } from "@app/types/conversation_todo_versioned";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { WorkspaceType } from "@app/types/user";
import { faker } from "@faker-js/faker";
import { beforeEach, describe, expect, it } from "vitest";

function makeActionItem(
  overrides: Partial<TodoVersionedActionItem> = {}
): TodoVersionedActionItem {
  return {
    sId: faker.string.nanoid(10),
    text: "Default action item",
    assigneeUserId: null,
    assigneeName: null,
    sourceMessageRank: 1,
    status: "open",
    detectedDoneAt: null,
    detectedDoneRationale: null,
    ...overrides,
  };
}

async function createSnapshot(
  auth: Authenticator,
  conversationId: number,
  actionItems: TodoVersionedActionItem[]
) {
  return ConversationTodoVersionedResource.makeNew(auth, {
    conversationId,
    runId: faker.string.uuid(),
    topic: "Test topic",
    actionItems,
    notableFacts: [],
    keyDecisions: [],
    agentSuggestions: [],
    lastRunAt: new Date(),
    lastProcessedMessageRank: actionItems.length,
  });
}

describe("mergeConversationTodosIntoProject", () => {
  let workspace: WorkspaceType;
  let adminAuth: Authenticator;
  let userAuth: Authenticator;
  let user: UserResource;
  let space: SpaceResource;
  let agent: AgentConfigurationType;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    adminAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    space = await SpaceFactory.project(workspace, user.id);
    agent = await AgentConfigurationFactory.createTestAgent(userAuth, {
      name: `Merge test agent ${faker.string.nanoid(4)}`,
    });
  });

  it("creates one todo per participant for each action item in the snapshot", async () => {
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
      spaceId: space.id,
    });
    await ConversationResource.upsertParticipation(adminAuth, {
      conversation,
      action: "posted",
      user: user.toJSON(),
    });

    const item = makeActionItem({ text: "Book the Q2 kickoff meeting" });
    await createSnapshot(adminAuth, conversation.id, [item]);

    await mergeConversationTodosIntoProject(adminAuth, {
      spaceSId: space.sId,
    });

    const todos = await ProjectTodoResource.fetchLatestBySpaceWithSources(
      adminAuth,
      { spaceId: space.id, category: "follow_ups" }
    );

    expect(todos).toHaveLength(1);
    expect(todos[0].todo.text).toBe("Book the Q2 kickoff meeting");
    expect(todos[0].todo.status).toBe("todo");
    expect(todos[0].todo.userId).toBe(user.id);
    expect(todos[0].todo.createdByType).toBe("agent");
    expect(todos[0].todo.version).toBe(1);
    expect(todos[0].conversationTodoVersionedActionItemSId).toBe(item.sId);
  });

  it("does not create duplicate todos when merge runs twice with identical snapshot", async () => {
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
      spaceId: space.id,
    });
    await ConversationResource.upsertParticipation(adminAuth, {
      conversation,
      action: "posted",
      user: user.toJSON(),
    });
    await createSnapshot(adminAuth, conversation.id, [makeActionItem()]);

    await mergeConversationTodosIntoProject(adminAuth, { spaceSId: space.sId });
    await mergeConversationTodosIntoProject(adminAuth, { spaceSId: space.sId });

    const todos = await ProjectTodoResource.fetchLatestBySpaceWithSources(
      adminAuth,
      { spaceId: space.id, category: "follow_ups" }
    );
    expect(todos).toHaveLength(1);
    expect(todos[0].todo.version).toBe(1);
  });

  it("creates a new version when the action item text changes in the snapshot", async () => {
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
      spaceId: space.id,
    });
    await ConversationResource.upsertParticipation(adminAuth, {
      conversation,
      action: "posted",
      user: user.toJSON(),
    });

    const itemSId = faker.string.nanoid(10);
    await createSnapshot(adminAuth, conversation.id, [
      makeActionItem({ sId: itemSId, text: "Original text" }),
    ]);
    await mergeConversationTodosIntoProject(adminAuth, { spaceSId: space.sId });

    // Update the snapshot with new text for the same sId.
    await createSnapshot(adminAuth, conversation.id, [
      makeActionItem({ sId: itemSId, text: "Updated text" }),
    ]);
    await mergeConversationTodosIntoProject(adminAuth, { spaceSId: space.sId });

    const todos = await ProjectTodoResource.fetchLatestBySpaceWithSources(
      adminAuth,
      { spaceId: space.id, category: "follow_ups" }
    );
    expect(todos).toHaveLength(1);
    expect(todos[0].todo.text).toBe("Updated text");
    expect(todos[0].todo.version).toBe(2);
  });

  it("auto-marks a todo as done when its action item is removed from the snapshot", async () => {
    const conversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
      spaceId: space.id,
    });
    await ConversationResource.upsertParticipation(adminAuth, {
      conversation,
      action: "posted",
      user: user.toJSON(),
    });

    const removedItem = makeActionItem({ text: "Task that will be removed" });
    const keptItem = makeActionItem({ text: "Task that stays" });
    await createSnapshot(adminAuth, conversation.id, [removedItem, keptItem]);
    await mergeConversationTodosIntoProject(adminAuth, { spaceSId: space.sId });

    // New snapshot: keptItem is still there but removedItem is gone.
    await createSnapshot(adminAuth, conversation.id, [keptItem]);
    await mergeConversationTodosIntoProject(adminAuth, { spaceSId: space.sId });

    const todos = await ProjectTodoResource.fetchLatestBySpaceWithSources(
      adminAuth,
      { spaceId: space.id, category: "follow_ups" }
    );

    const removed = todos.find(
      (t) =>
        t.conversationTodoVersionedActionItemSId === removedItem.sId
    );
    const kept = todos.find(
      (t) => t.conversationTodoVersionedActionItemSId === keptItem.sId
    );

    expect(removed?.todo.status).toBe("done");
    expect(removed?.todo.markedAsDoneByType).toBe("agent");
    expect(removed?.todo.markedAsDoneByAgentConfigurationId).toBe(
      PROJECT_TODO_AGENT_CONFIGURATION_ID
    );
    expect(kept?.todo.status).toBe("todo");
  });
});
