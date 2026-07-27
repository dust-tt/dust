import type { ToolGeneratedFileType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { rewriteContentForModel } from "@app/lib/actions/mcp_utils";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { describe, expect, it } from "vitest";

describe("rewriteContentForModel", () => {
  it("preserves a generated file path for direct file access", () => {
    const path = "conversation-conv_123/screenshot.png";
    const resource: ToolGeneratedFileType = {
      mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
      uri: "file://fil_123",
      fileId: "fil_123",
      path,
      title: "screenshot.png",
      contentType: "image/png",
      snippet: null,
      text: "Attachment: screenshot.png",
    };
    const result = rewriteContentForModel({
      type: "resource",
      resource,
    });

    expect(result).toEqual(
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining(`path="${path}"`),
      })
    );
  });
});
