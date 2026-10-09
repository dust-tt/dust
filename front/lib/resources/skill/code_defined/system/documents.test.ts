import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  DOCUMENTS_REPLY_TO_COMMENT_ACTION_NAME,
  DOCUMENTS_SERVER_NAME,
} from "@app/lib/api/actions/servers/documents/metadata";
import {
  documentCommentMessageHeading,
  documentsSkill,
  getDocumentsInstructions,
  isDocumentCommentMessage,
} from "@app/lib/resources/skill/code_defined/system/documents";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

const IMAGE_GUIDANCE = "![Revenue by quarter](pod-<id>/charts/revenue.png)";
const REPLY_TOOL = getPrefixedToolName(
  DOCUMENTS_SERVER_NAME,
  DOCUMENTS_REPLY_TO_COMMENT_ACTION_NAME
);

describe("documentsSkill", () => {
  it("is enabled only in conversations that use the file system", async () => {
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
      documentsSkill.getAutoEnabledOrEquippedForAgentLoop({
        agentConfiguration,
        conversation: withFileSystem(true),
      })
    ).toBe("enabled");
    expect(
      documentsSkill.getAutoEnabledOrEquippedForAgentLoop({
        agentConfiguration,
        conversation: withFileSystem(false),
      })
    ).toBeUndefined();
  });

  it("explains images, and comments only for a comment message", () => {
    const heading = documentCommentMessageHeading({
      commentId: "c1",
      documentPath: "pod-abc/plan.md",
      location: 'the pod "Launch"',
    });

    const plain = getDocumentsInstructions("Add a chart to plan.md");
    const comment = getDocumentsInstructions(`${heading}\n\nThoughts?`);
    const withoutRun = getDocumentsInstructions(null);

    for (const instructions of [plain, comment, withoutRun]) {
      expect(instructions).toContain(IMAGE_GUIDANCE);
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
