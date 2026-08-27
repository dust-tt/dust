import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import createInteractiveContentServer from "@app/lib/api/actions/servers/interactive_content";
import { PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it } from "vitest";

async function getPublishDescription({
  enableFramesV2,
}: {
  enableFramesV2: boolean;
}) {
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
  return tools.find(
    (tool) => tool.name === PUBLISH_INTERACTIVE_CONTENT_FILE_TOOL_NAME
  )?.description;
}

describe("interactive_content", () => {
  it("routes only flagged workspaces to the Frames v2 server", async () => {
    await expect(
      getPublishDescription({ enableFramesV2: false })
    ).resolves.not.toContain("canonical `manifest.json`");
    await expect(
      getPublishDescription({ enableFramesV2: true })
    ).resolves.toContain("canonical `manifest.json`");
  });
});
