import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import createFileGenerationServer from "@app/lib/api/actions/servers/file_generation";
import { OUTPUT_FORMATS } from "@app/lib/api/actions/servers/file_generation/metadata";
import { createFileGenerationTools } from "@app/lib/api/actions/servers/file_generation/tools";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import assert from "assert";
import { describe, expect, it } from "vitest";

describe("file_generation PDF availability", () => {
  it("leaves PDF output to the Computer", async () => {
    const { authenticator: auth } = await createResourceTest({});

    const server = await createFileGenerationServer(auth);
    const client = new Client({
      name: "file-generation-test",
      version: "1.0.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryWithAuthTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    for (const name of [
      "get_supported_source_formats_for_output_format",
      "convert_file_format",
    ]) {
      expect(tools.find((tool) => tool.name === name)).toMatchObject({
        inputSchema: {
          properties: {
            output_format: {
              enum: OUTPUT_FORMATS,
            },
          },
        },
      });
      const result = await client.callTool({
        name,
        arguments: {
          output_format: "pdf",
          ...(name === "convert_file_format"
            ? {
                file_name: "report",
                file_id_or_url: "https://example.com/report.docx",
                source_format: "docx",
              }
            : {}),
        },
      });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("output_format"),
        }),
      ]);
    }

    const definitions = createFileGenerationTools();
    const generateFile = definitions.find(
      (tool) => tool.name === "generate_file"
    );
    assert(generateFile);
    for (const name of [
      "report.pdf",
      "report.PDF",
      "report.pdf/",
      "report.pdf///",
    ]) {
      expect(generateFile.schema.file_name.safeParse(name).success).toBe(false);
      const result = await client.callTool({
        name: "generate_file",
        arguments: { file_name: name, file_content: "Report" },
      });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("PDFs skill"),
        }),
      ]);
    }
    for (const format of OUTPUT_FORMATS) {
      expect(
        generateFile.schema.file_name.safeParse(`report.${format}`).success
      ).toBe(true);
    }

    await client.close();
  });
});
