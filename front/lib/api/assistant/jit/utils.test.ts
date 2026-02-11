import { beforeEach, describe, expect, it } from "vitest";

import { getProjectContextDataSourceView } from "@app/lib/api/assistant/jit/utils";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ConversationType } from "@app/types/assistant/conversation";

describe("getProjectContextDataSourceView", () => {
  let auth: Authenticator;
  let conversationsSpace: SpaceResource;
  let conversation: ConversationType;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "admin" });
    auth = setup.authenticator;
    conversationsSpace = setup.conversationsSpace;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
  });

  it("should return null for conversation not in a space", async () => {
    const result = await getProjectContextDataSourceView(auth, conversation);
    expect(result).toBeNull();
  });

  it("should return null when space has no project context datasource", async () => {
    const conversationInSpace = {
      ...conversation,
      spaceId: conversationsSpace.sId,
    };

    const result = await getProjectContextDataSourceView(
      auth,
      conversationInSpace
    );
    expect(result).toBeNull();
  });
});
