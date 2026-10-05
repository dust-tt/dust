import type { ToolDefinition } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  INTERACTIVE_CONTENT_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentV2Tools } from "@app/lib/api/actions/servers/interactive_content_v2/tools";
import {
  makeExtra,
  setupPlainConversation,
} from "@app/tests/utils/conversation_test_factories";
import { frameContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

const { legacyHandler } = vi.hoisted(() => ({ legacyHandler: vi.fn() }));

vi.mock("@app/lib/api/actions/servers/interactive_content/tools", () => ({
  createInteractiveContentTools: async (): Promise<ToolDefinition[]> =>
    INTERACTIVE_CONTENT_TOOLS_METADATA.map((tool) => ({
      ...tool,
      handler: legacyHandler,
    })),
}));

describe("createInteractiveContentV2Tools", () => {
  it("creates Frames from templates only", async () => {
    legacyHandler.mockResolvedValue(new Ok([]));
    const { auth, conversation } = await setupPlainConversation();
    const extra = makeExtra(auth, conversation);

    const v2Tools = await createInteractiveContentV2Tools(auth, {
      runContext: extra.runContext,
    });
    const createTool = v2Tools.find(
      (tool) => tool.name === CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME
    );
    if (!createTool) {
      throw new Error("Expected the create tool.");
    }
    expect(Object.keys(createTool.schema)).not.toContain("mode");

    const params = {
      file_name: "Proposal.tsx",
      mime_type: frameContentType,
      source: "proposal_template_node",
    };
    await createTool.handler(params, extra);

    expect(legacyHandler).toHaveBeenCalledWith(
      { ...params, mode: "template" },
      extra
    );
  });
});
