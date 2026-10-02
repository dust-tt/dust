import type {
  ToolDefinition,
  ToolHandlerExtra,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  INTERACTIVE_CONTENT_TOOLS_METADATA,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentV2Tools } from "@app/lib/api/actions/servers/interactive_content_v2/tools";
import type { Authenticator } from "@app/lib/auth";
import { frameContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { legacyHandler } = vi.hoisted(() => ({ legacyHandler: vi.fn() }));

vi.mock("@app/lib/api/actions/servers/interactive_content/tools", () => ({
  createInteractiveContentTools: async (): Promise<ToolDefinition[]> =>
    INTERACTIVE_CONTENT_TOOLS_METADATA.filter((tool) =>
      [
        CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
        EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
        EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
        PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
      ].includes(tool.name)
    ).map((tool) => ({ ...tool, handler: legacyHandler })),
}));

const auth = {} as Authenticator;
const extra = {} as ToolHandlerExtra;

describe("createInteractiveContentV2Tools", () => {
  beforeEach(() => {
    legacyHandler.mockReset();
    legacyHandler.mockResolvedValue(new Ok([]));
  });

  it("exposes only template creation and PNG and PDF export", async () => {
    const v2Tools = await createInteractiveContentV2Tools(auth);

    expect(v2Tools.map((tool) => tool.name)).toEqual([
      CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
      EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    ]);
  });

  it("creates Frames from templates only", async () => {
    const v2Tools = await createInteractiveContentV2Tools(auth);
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
