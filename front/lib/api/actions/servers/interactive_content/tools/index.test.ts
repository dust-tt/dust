import type { ToolContextType } from "@app/lib/actions/types";
import { EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentTools } from "@app/lib/api/actions/servers/interactive_content/tools";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

function toolContextWithUseFileSystem(
  useFileSystem: boolean | undefined
): ToolContextType {
  return {
    runContext: { conversation: { metadata: { useFileSystem } } },
  } as unknown as ToolContextType;
}

describe("createInteractiveContentTools", () => {
  it("drops the file-id edit tool when the conversation has the file system", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const tools = await createInteractiveContentTools(
      auth,
      toolContextWithUseFileSystem(true)
    );
    const names = tools.map((tool) => tool.name);

    expect(names).not.toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain("publish_interactive_content_file");
    expect(names).toContain("create_interactive_content_file");
  });

  it("keeps the file-id edit tool for legacy conversations", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const tools = await createInteractiveContentTools(
      auth,
      toolContextWithUseFileSystem(undefined)
    );

    expect(tools.map((tool) => tool.name)).toContain(
      EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME
    );
  });

  it("keeps the file-id edit tool when no conversation is available", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const tools = await createInteractiveContentTools(auth, undefined);

    expect(tools.map((tool) => tool.name)).toContain(
      EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME
    );
  });
});
