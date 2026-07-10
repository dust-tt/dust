import type { ToolContext } from "@app/lib/actions/types";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { createInteractiveContentTools } from "@app/lib/api/actions/servers/interactive_content/tools";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
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

describe("createInteractiveContentTools", () => {
  it("drops the file-id edit tool but keeps retrieve when the conversation has the file system", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const tools = await createInteractiveContentTools(
      auth,
      toolContextWithUseFileSystem(true)
    );
    const names = tools.map((tool) => tool.name);

    expect(names).not.toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
  });

  it("keeps the file-id edit and retrieve tools for legacy conversations", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const tools = await createInteractiveContentTools(
      auth,
      toolContextWithUseFileSystem(undefined)
    );
    const names = tools.map((tool) => tool.name);

    expect(names).toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
  });

  it("keeps the file-id edit and retrieve tools when no conversation is available", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const tools = await createInteractiveContentTools(auth, undefined);
    const names = tools.map((tool) => tool.name);

    expect(names).toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
  });
});
