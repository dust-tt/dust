import { beforeEach, describe, expect, it } from "vitest";

import { moveConversationToProject } from "@app/lib/api/projects/conversations";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { isProjectConversation } from "@app/types/assistant/conversation";

describe("moveConversationToProject", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;
  });

  it("moves a non-project conversation to a project and updates its space", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    // Create a project space and add the user as a member.
    const projectSpace = await SpaceFactory.project(workspace);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    const projectSpaceGroup = projectSpace.groups.find(
      (g) => g.kind === "regular"
    );
    if (!projectSpaceGroup) {
      throw new Error("Project space regular group not found");
    }
    const addRes = await projectSpaceGroup.dangerouslyAddMember(internalAdminAuth, {
      user: userJson,
    });
    if (addRes.isErr()) {
      throw new Error(
        `Failed to add user to project space group: ${addRes.error.message}`
      );
    }

    await auth.refresh();

    const result = await moveConversationToProject(
      auth,
      conversation,
      projectSpace
    );

    expect(result.isOk()).toBe(true);

    const updatedConversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(updatedConversationResource).not.toBeNull();
    if (!updatedConversationResource) {
      throw new Error("Conversation not found after move");
    }
    const updatedConversation = updatedConversationResource.toJSON();

    // The conversation should now be associated to the project space
    expect(updatedConversation.spaceId).toBe(projectSpace.sId);
    // And its requestedSpaceIds should match the project space
    expect(updatedConversation.requestedSpaceIds).toHaveLength(1);
    expect(updatedConversation.requestedSpaceIds[0]).toBe(projectSpace.sId);
    expect(isProjectConversation(updatedConversation)).toBe(true);
  });

  it("returns unauthorized when user is not a member of the project", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    const projectSpace = await SpaceFactory.project(workspace);

    const result = await moveConversationToProject(
      auth,
      conversation,
      projectSpace
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(DustError);
      expect(result.error.code).toBe("unauthorized");
      expect(result.error.message).toBe("User is not a member of the project");
    }
  });
});
