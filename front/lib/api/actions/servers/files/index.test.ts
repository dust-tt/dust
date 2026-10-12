import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import createFilesServer from "@app/lib/api/actions/servers/files";
import {
  FILES_CAT_ACTION_NAME,
  FILES_LIST_ACTION_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it } from "vitest";

describe("PDF skill and files tools availability", () => {
  it("exposes the PDF skill and the files tools", async () => {
    const { authenticator: auth } = await createResourceTest({});

    // No agent loop or enabled Computer skill is required to discover the PDF skill.
    const pdfSkill = await GlobalSkillsRegistry.getById(auth, "pdf");
    expect(pdfSkill).not.toBeNull();

    const server = createFilesServer(auth);
    const client = new Client({ name: "files-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryWithAuthTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    await client.close();

    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).toContain(FILES_CAT_ACTION_NAME);
    expect(toolNames).toContain(FILES_LIST_ACTION_NAME);
  });
});
