import type { ToolContext } from "@app/lib/actions/types";
import { PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentV2Tools } from "@app/lib/api/actions/servers/interactive_content_v2/tools";
import { publishFrame } from "@app/lib/api/viz/publish_frame";
import {
  makeExtra,
  setupPlainConversation,
} from "@app/tests/utils/conversation_test_factories";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { frameContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/viz/publish_frame", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/viz/publish_frame")>();
  return { ...actual, publishFrame: vi.fn() };
});

describe("createInteractiveContentV2Tools", () => {
  it("keeps legacy Frame publishing backward-compatible", async () => {
    const { auth, conversation } = await setupPlainConversation();
    const owner = auth.getNonNullableWorkspace();
    const framePath = `conversation-${conversation.sId}/Legacy.tsx`;
    const frame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "Legacy.tsx",
      fileSize: 10,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
      mountFilePath: `${getConversationFilesBasePath({
        workspaceId: owner.sId,
        conversationId: conversation.sId,
      })}Legacy.tsx`,
    });
    const extra = makeExtra(auth, conversation);
    const toolContext: ToolContext = { runContext: extra.runContext };
    const tools = await createInteractiveContentV2Tools(auth, toolContext);
    const publishTool = tools.find(
      (tool) => tool.name === PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME
    );
    assert(publishTool);
    vi.mocked(publishFrame).mockResolvedValue(new Ok({ warnings: [] }));

    const result = await publishTool.handler(
      { file_id: frame.sId, path: framePath },
      extra
    );

    expect(result.isOk()).toBe(true);
    expect(publishFrame).toHaveBeenCalledOnce();
  });
});
