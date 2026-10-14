import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  DOCUMENTS_EDIT_DOCUMENT_ACTION_NAME,
  DOCUMENTS_READ_DOCUMENT_ACTION_NAME,
  DOCUMENTS_REPLY_TO_COMMENT_ACTION_NAME,
  DOCUMENTS_SERVER_NAME,
} from "@app/lib/api/actions/servers/documents/metadata";
import {
  FILES_RESOLVE_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import {
  getMarkdownDocumentsInstructions,
  markdownDocumentsSkill,
} from "@app/lib/resources/skill/code_defined/global/markdown_documents";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

const REPLY_TOOL = getPrefixedToolName(
  DOCUMENTS_SERVER_NAME,
  DOCUMENTS_REPLY_TO_COMMENT_ACTION_NAME
);

describe("markdownDocumentsSkill", () => {
  it("is enabled for a comment message and offered otherwise", async () => {
    const { authenticator: auth } = await createResourceTest({});
    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace: auth.getNonNullableWorkspace(),
      conversation,
      content: "Thoughts?",
    });
    const stateFor = (origin: UserMessageOrigin | null) =>
      markdownDocumentsSkill.getAutoEnabledOrEquippedForAgentLoop({
        agentConfiguration,
        conversation,
        userMessage:
          origin === null
            ? undefined
            : { ...userMessage, context: { ...userMessage.context, origin } },
      });

    expect(stateFor("document_comment")).toBe("enabled");
    expect(stateFor("web")).toBe("equipped");
    expect(stateFor(null)).toBe("equipped");
  });

  it("explains the document tools and images, and comments only for a comment message", () => {
    const plain = getMarkdownDocumentsInstructions("web");
    const comment = getMarkdownDocumentsInstructions("document_comment");
    const withoutRun = getMarkdownDocumentsInstructions(null);

    for (const instructions of [plain, comment, withoutRun]) {
      expect(instructions).toContain(
        "![Revenue by quarter](pod-<id>/charts/revenue.png)"
      );
      expect(instructions).toContain(
        '::embed_frame{path="pod-<id>/dashboards/revenue.tsx"}'
      );
      expect(instructions).toContain(
        ':preview_file{path="pod-<id>/reports/q3.pdf" title="Q3 report"}'
      );
      expect(instructions).toContain(
        getPrefixedToolName(FILES_SERVER_NAME, FILES_RESOLVE_ACTION_NAME)
      );
      expect(instructions).toContain(
        getPrefixedToolName(
          DOCUMENTS_SERVER_NAME,
          DOCUMENTS_READ_DOCUMENT_ACTION_NAME
        )
      );
      expect(instructions).toContain(
        getPrefixedToolName(
          DOCUMENTS_SERVER_NAME,
          DOCUMENTS_EDIT_DOCUMENT_ACTION_NAME
        )
      );
    }
    expect(comment).toContain(REPLY_TOOL);
    expect(plain).not.toContain(REPLY_TOOL);
    expect(withoutRun).not.toContain(REPLY_TOOL);
  });
});
