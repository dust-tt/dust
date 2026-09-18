import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import createInteractiveContentServer from "@app/lib/api/actions/servers/interactive_content";
import {
  CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
  PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
} from "@app/lib/api/actions/servers/interactive_content/metadata";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it } from "vitest";

async function listToolNames({ enableFramesV2 }: { enableFramesV2: boolean }) {
  const { authenticator: auth, workspace } = await createResourceTest({});
  if (enableFramesV2) {
    await FeatureFlagResource.enable(workspace, "frames_v2");
  }

  const server = await createInteractiveContentServer(auth);
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

describe("interactive_content", () => {
  it("keeps the server available when Frames v2 is enabled", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const serverId = autoInternalMCPServerNameToSId({
      name: "interactive_content",
      workspaceId: workspace.id,
    });
    expect(
      await InternalMCPServerInMemoryResource.fetchById(auth, serverId)
    ).not.toBeNull();

    await FeatureFlagResource.enable(workspace, "frames_v2");

    expect(
      await InternalMCPServerInMemoryResource.fetchById(auth, serverId)
    ).not.toBeNull();
  });

  it("routes only flagged workspaces to the Frames v2 server", async () => {
    await expect(listToolNames({ enableFramesV2: false })).resolves.toEqual(
      expect.arrayContaining([
        CREATE_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
        EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
        PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
      ])
    );
    await expect(listToolNames({ enableFramesV2: true })).resolves.toEqual([
      EXPORT_INTERACTIVE_CONTENT_FILE_TOOL_NAME,
    ]);
  });
});
