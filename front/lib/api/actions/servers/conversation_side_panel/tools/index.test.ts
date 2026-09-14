import { OPEN_FRAME_TOOL_NAME } from "@app/lib/api/actions/servers/conversation_side_panel/metadata";
import { TOOLS } from "@app/lib/api/actions/servers/conversation_side_panel/tools";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { frameV2ContentType } from "@app/types/files";
import { getPodFilesBasePath } from "@app/types/mount_path";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

describe("conversation_side_panel.open_frame", () => {
  it("resolves a Frames v2 manifest path and returns it as a generated file", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const workspace = auth.getNonNullableWorkspace();
    const scopedPath = `pod-${projectId}/hello-frame/manifest.json`;
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 100,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: {
        spaceId: projectId,
        frameName: "Hello Frame",
      },
      mountFilePath: `${getPodFilesBasePath({
        workspaceId: workspace.sId,
        podId: projectId,
      })}hello-frame/manifest.json`,
    });
    const sendNotification = vi.fn(async () => undefined);
    const openFrameTool = TOOLS.find(
      (tool) => tool.name === OPEN_FRAME_TOOL_NAME
    );
    assert(openFrameTool, "open_frame tool expected");

    const result = await openFrameTool.handler(
      { path: `/files/${scopedPath}` },
      {
        ...makeExtra(auth, conversation),
        _meta: { progressToken: "progress-1" },
        sendNotification,
      }
    );

    assert(result.isOk());
    expect(result.value).toEqual([
      {
        type: "resource",
        resource: {
          contentType: frameV2ContentType,
          fileId: frame.sId,
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
          snippet: null,
          text: `Opened Frame '${frame.sId}' (Hello Frame) in the side panel.`,
          title: "Hello Frame",
          uri: expect.any(String),
        },
      },
    ]);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          progressToken: "progress-1",
          _meta: expect.objectContaining({
            data: expect.objectContaining({
              output: expect.objectContaining({
                fileId: frame.sId,
                mimeType: frameV2ContentType,
                title: "Hello Frame",
                type: "interactive_content_file",
              }),
            }),
          }),
        }),
      })
    );
  });
});
