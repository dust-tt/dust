import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_RESOLVE_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import { markdownDocumentsSkill } from "@app/lib/resources/skill/code_defined/global/markdown_documents";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("markdownDocumentsSkill", () => {
  it("is offered only in conversations that use the file system", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    const withFileSystem = (useFileSystem: boolean) => ({
      ...conversation,
      metadata: { ...conversation.metadata, useFileSystem },
    });

    expect(
      markdownDocumentsSkill.getAutoEnabledOrEquippedForAgentLoop({
        agentConfiguration,
        conversation: withFileSystem(true),
      })
    ).toBe("equipped");
    expect(
      markdownDocumentsSkill.getAutoEnabledOrEquippedForAgentLoop({
        agentConfiguration,
        conversation: withFileSystem(false),
      })
    ).toBeUndefined();
  });

  it("explains how to embed an image by its file path", () => {
    expect(markdownDocumentsSkill.instructions).toContain(
      "![Revenue by quarter](pod-<id>/charts/revenue.png)"
    );
    expect(markdownDocumentsSkill.instructions).toContain(
      getPrefixedToolName(FILES_SERVER_NAME, FILES_RESOLVE_ACTION_NAME)
    );
  });
});
