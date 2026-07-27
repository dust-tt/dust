import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import type { ToolContext } from "@app/lib/actions/types";
import createServer from "@app/lib/api/actions/servers/interactive_content";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import type { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
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

async function getToolNames(
  auth: Authenticator,
  toolContext?: ToolContext
): Promise<string[]> {
  const server = await createServer(auth, toolContext);
  const client = new Client({
    name: "interactive-content-test",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryWithAuthTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  await client.close();

  return tools.map((tool) => tool.name);
}

describe("interactive content server", () => {
  it("drops the file-id edit tool but keeps retrieve when the conversation has the file system", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const names = await getToolNames(auth, toolContextWithUseFileSystem(true));

    expect(names).not.toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
  });

  it("keeps the file-id edit and retrieve tools for legacy conversations", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const names = await getToolNames(
      auth,
      toolContextWithUseFileSystem(undefined)
    );

    expect(names).toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
  });

  it("keeps the file-id edit and retrieve tools when no conversation is available", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const names = await getToolNames(auth);

    expect(names).toContain(EDIT_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
    expect(names).toContain(RETRIEVE_INTERACTIVE_CONTENT_FILE_TOOL_NAME);
  });
});
