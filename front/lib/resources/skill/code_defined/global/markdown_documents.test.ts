import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  DOCUMENTS_REPLY_TO_COMMENT_ACTION_NAME,
  DOCUMENTS_SERVER_NAME,
} from "@app/lib/api/actions/servers/documents/metadata";
import {
  FILES_RESOLVE_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import {
  documentCommentMessageHeading,
  getMarkdownDocumentsInstructions,
  isDocumentCommentMessage,
  markdownDocumentsSkill,
} from "@app/lib/resources/skill/code_defined/global/markdown_documents";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

const HEADING = documentCommentMessageHeading({
  commentId: "c1",
  documentPath: "pod-abc/plan.md",
  location: 'the pod "Launch"',
});
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
      content: `${HEADING}\n\nThoughts?`,
    });
    const stateFor = (content: string | null) =>
      markdownDocumentsSkill.getAutoEnabledOrEquippedForAgentLoop({
        agentConfiguration,
        conversation,
        userMessage:
          content === null ? undefined : { ...userMessage, content },
      });

    expect(stateFor(`${HEADING}\n\nThoughts?`)).toBe("enabled");
    expect(stateFor("Add a chart to plan.md")).toBe("equipped");
    expect(stateFor(null)).toBe("equipped");
  });

  it("explains images, and comments only for a comment message", () => {
    const plain = getMarkdownDocumentsInstructions("Add a chart to plan.md");
    const comment = getMarkdownDocumentsInstructions(`${HEADING}\n\nThoughts?`);
    const withoutRun = getMarkdownDocumentsInstructions(null);

    for (const instructions of [plain, comment, withoutRun]) {
      expect(instructions).toContain(
        "![Revenue by quarter](pod-<id>/charts/revenue.png)"
      );
      expect(instructions).toContain(
        getPrefixedToolName(FILES_SERVER_NAME, FILES_RESOLVE_ACTION_NAME)
      );
    }
    expect(comment).toContain(REPLY_TOOL);
    expect(plain).not.toContain(REPLY_TOOL);
    expect(withoutRun).not.toContain(REPLY_TOOL);
  });

  it.each([
    ["pod-abc/plan.md", 'the pod "Launch"'],
    ["pod-abc/use`code`.md", 'the pod "Launch"'],
    ["pod-abc/plan.md", 'the pod "Launch\nQ4"'],
  ])(
    "recognizes a message opening with the comment heading for %j",
    (documentPath, location) => {
      const heading = documentCommentMessageHeading({
        commentId: "c1",
        documentPath,
        location,
      });

      expect(isDocumentCommentMessage(`${heading}\n\nThoughts @dust?`)).toBe(
        true
      );
    }
  );

  it.each([
    "Summarize plan.md, please.",
    "Comment in thread `c1` disappeared; help me debug it",
  ])("does not recognize %j", (content) => {
    expect(isDocumentCommentMessage(content)).toBe(false);
  });
});
