import type { ToolContext } from "@app/lib/actions/types";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  INTERACTIVE_CONTENT_TOOLS_METADATA,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { describe, expect, it } from "vitest";

function toolContextWithUseFileSystem(
  useFileSystem: boolean | undefined
): ToolContext {
  return {
    runContext: {
      contextType: "agent_loop",
      conversation: { metadata: { useFileSystem } },
    },
  } as unknown as ToolContext;
}

describe("interactive content tool availability", () => {
  it("drops the file-id edit tool but keeps retrieve when the conversation has the file system", () => {
    const names = INTERACTIVE_CONTENT_TOOLS_METADATA.filter(
      (tool) =>
        !("isAvailableForContext" in tool) ||
        tool.isAvailableForContext({
          toolContext: toolContextWithUseFileSystem(true),
        })
    ).map((tool) => tool.name);

    expect(names).not.toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
  });

  it("keeps the file-id edit and retrieve tools for legacy conversations", () => {
    const names = INTERACTIVE_CONTENT_TOOLS_METADATA.filter(
      (tool) =>
        !("isAvailableForContext" in tool) ||
        tool.isAvailableForContext({
          toolContext: toolContextWithUseFileSystem(undefined),
        })
    ).map((tool) => tool.name);

    expect(names).toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
  });

  it("drops the file-id edit tool when no conversation is available", () => {
    const names = INTERACTIVE_CONTENT_TOOLS_METADATA.filter(
      (tool) =>
        !("isAvailableForContext" in tool) ||
        tool.isAvailableForContext({ toolContext: undefined })
    ).map((tool) => tool.name);

    expect(names).not.toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
  });
});
