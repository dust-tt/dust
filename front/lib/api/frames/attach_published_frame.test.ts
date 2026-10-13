import { attachPublishedFrameToParentAction } from "@app/lib/api/frames/attach_published_frame";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { describe, expect, it } from "vitest";

describe("attachPublishedFrameToParentAction", () => {
  it("attaches the Frame as a generated file on the parent action", async () => {
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

    const result = await attachPublishedFrameToParentAction(context.auth, {
      actionId: action.sId,
      frameId: frame.sId,
    });
    expect(result.isOk()).toBe(true);

    const [enriched] =
      await AgentMCPActionResource.enrichActionsWithOutputItems(context.auth, {
        actions: [action],
        ignoreContent: false,
      });
    expect(enriched.generatedFiles).toEqual([
      expect.objectContaining({
        fileId: frame.sId,
        contentType: frameV2ContentType,
      }),
    ]);
  });

  it("returns an error when the parent action is missing", async () => {
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

    const result = await attachPublishedFrameToParentAction(context.auth, {
      actionId: "act_missing",
      frameId: frame.sId,
    });
    expect(result.isErr()).toBe(true);
  });
});
