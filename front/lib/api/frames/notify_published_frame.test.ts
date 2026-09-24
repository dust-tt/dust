import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import { notifyPublishedFrameSidePanel } from "@app/lib/api/frames/notify_published_frame";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishConversationRelatedEvent: vi.fn(),
}));

describe("notifyPublishedFrameSidePanel", () => {
  beforeEach(() => {
    vi.mocked(publishConversationRelatedEvent).mockClear();
    vi.mocked(publishConversationRelatedEvent).mockResolvedValue(undefined);
  });

  it("emits an interactive_content_file tool_notification on the parent action", async () => {
    const context = await createSandboxTokenTestContext();
    const { action } = await AgentMCPActionFactory.create(context.auth, {
      workspace: context.workspace,
      conversationModelId: context.conversation.id,
      agentMessageModelId: context.agentMessage.agentMessageId,
      status: "running",
      step: 2,
      functionCallName: "bash",
      toolName: "bash",
      mcpServerName: "sandbox",
    });
    const frame = await FileFactory.create(context.auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 1,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: context.conversation.sId },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: context.workspace.sId,
        conversationId: context.conversation.sId,
      })}Status/${FRAME_MANIFEST_FILE}`,
    });

    await notifyPublishedFrameSidePanel(context.auth, {
      actionId: action.sId,
      configurationId: context.agentConfig.sId,
      conversationId: context.conversation.sId,
      frameId: frame.sId,
      messageId: context.agentMessage.sId,
    });

    expect(publishConversationRelatedEvent).toHaveBeenCalledTimes(1);
    expect(publishConversationRelatedEvent).toHaveBeenCalledWith({
      conversationId: context.conversation.sId,
      step: 2,
      event: expect.objectContaining({
        type: "tool_notification",
        configurationId: context.agentConfig.sId,
        conversationId: context.conversation.sId,
        messageId: context.agentMessage.sId,
        action: expect.objectContaining({
          sId: action.sId,
          id: action.id,
        }),
        notification: expect.objectContaining({
          _meta: {
            data: {
              label: "Publishing Frame...",
              output: {
                type: "interactive_content_file",
                fileId: frame.sId,
                mimeType: frameV2ContentType,
                title: expect.any(String),
                updatedAt: frame.updatedAtMs.toString(),
              },
            },
          },
        }),
      }),
    });
  });

  it("skips quietly when the parent action is missing", async () => {
    const context = await createSandboxTokenTestContext();
    const frame = await FileFactory.create(context.auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 1,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: context.conversation.sId },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: context.workspace.sId,
        conversationId: context.conversation.sId,
      })}Status/${FRAME_MANIFEST_FILE}`,
    });

    await notifyPublishedFrameSidePanel(context.auth, {
      actionId: "act_missing",
      configurationId: context.agentConfig.sId,
      conversationId: context.conversation.sId,
      frameId: frame.sId,
      messageId: context.agentMessage.sId,
    });

    expect(publishConversationRelatedEvent).not.toHaveBeenCalled();
  });

  it("does not throw when event publication fails", async () => {
    const context = await createSandboxTokenTestContext();
    const { action } = await AgentMCPActionFactory.create(context.auth, {
      workspace: context.workspace,
      conversationModelId: context.conversation.id,
      agentMessageModelId: context.agentMessage.agentMessageId,
      status: "running",
    });
    const frame = await FileFactory.create(context.auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 1,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: context.conversation.sId },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: context.workspace.sId,
        conversationId: context.conversation.sId,
      })}Status/${FRAME_MANIFEST_FILE}`,
    });
    vi.mocked(publishConversationRelatedEvent).mockRejectedValue(
      new Error("redis down")
    );

    await expect(
      notifyPublishedFrameSidePanel(context.auth, {
        actionId: action.sId,
        configurationId: context.agentConfig.sId,
        conversationId: context.conversation.sId,
        frameId: frame.sId,
        messageId: context.agentMessage.sId,
      })
    ).resolves.toBeUndefined();
  });
});
