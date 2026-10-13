import { TOOL_FILE_DOWNLOAD_MAX_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  downloadAndProcessMicrosoftFile,
  downloadDriveItemAsBuffer,
  getGraphClient,
} from "@app/lib/api/actions/servers/microsoft/utils";
import { isTextExtractionSupportedContentType } from "@app/types/shared/text_extraction";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TOOLS } from "./index";

vi.mock(
  "@app/lib/api/actions/servers/microsoft/utils",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@app/lib/api/actions/servers/microsoft/utils")
    >()),
    getGraphClient: vi.fn(),
    getAllowedLabelsForMCPServer: vi.fn().mockResolvedValue([]),
    downloadDriveItemAsBuffer: vi.fn(),
    downloadAndProcessMicrosoftFile: vi.fn(),
  })
);

describe("get_file_content", () => {
  // Partial stub: the get_file_content handler only reads the workspace from auth.
  // Same pattern as the other MCP tool tests (google_drive/tools).
  const extra = {
    auth: { getNonNullableWorkspace: () => ({ sId: "w1" }) },
    authInfo: { token: "token" },
    runContext: undefined,
  } as unknown as ToolHandlerExtra;

  function mockDriveItem(item: {
    name: string;
    size: number;
    mimeType: string;
  }) {
    const fakeClient = {
      api: () => ({
        select: () => ({
          get: async () => ({
            name: item.name,
            size: item.size,
            file: { mimeType: item.mimeType },
          }),
        }),
      }),
    };
    // The fake client only implements the calls the handler makes.
    vi.mocked(getGraphClient).mockResolvedValue(
      fakeClient as unknown as Awaited<ReturnType<typeof getGraphClient>>
    );
  }

  async function callTool(params: {
    offset: number;
    limit: number;
    getAsXml?: boolean;
  }) {
    const tool = TOOLS.find((t) => t.name === "get_file_content");
    if (!tool) {
      throw new Error("get_file_content tool not found");
    }
    return tool.handler(
      { itemId: "item-1", driveId: "drive-1", ...params },
      extra
    );
  }

  function getContent(result: Awaited<ReturnType<typeof callTool>>) {
    if (result.isErr()) {
      throw new Error(`Expected Ok result, got: ${result.error.message}`);
    }
    return result.value;
  }

  function parseTextBlock(block: { type: string; text?: string }) {
    if (block.type !== "text" || block.text === undefined) {
      throw new Error("Expected a text block");
    }
    return JSON.parse(block.text);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // `@app/types/shared/text_extraction` is globally mocked in vite.setup.ts;
    // mirror the real behavior of marking only Tika-supported types.
    vi.mocked(isTextExtractionSupportedContentType).mockImplementation(
      (contentType: string) => contentType === "application/pdf"
    );
  });

  it("rejects files over the download limit without downloading them", async () => {
    mockDriveItem({
      name: "huge.pdf",
      size: TOOL_FILE_DOWNLOAD_MAX_SIZE_BYTES + 1,
      mimeType: "application/pdf",
    });

    const result = await callTool({ offset: 0, limit: 100 });

    expect(result.isErr()).toBe(true);
    expect(downloadDriveItemAsBuffer).not.toHaveBeenCalled();
  });

  it("rejects binaries with no readable text over the offload limit without downloading them", async () => {
    mockDriveItem({
      name: "photo.png",
      size: 5 * 1024 * 1024,
      mimeType: "image/png",
    });

    const result = await callTool({ offset: 0, limit: 100 });

    expect(result.isErr()).toBe(true);
    expect(downloadDriveItemAsBuffer).not.toHaveBeenCalled();
  });

  it("paginates text and attaches the file on the first page only", async () => {
    const text = "abcdefghijklmnopqrstuvwxyz";
    mockDriveItem({
      name: "notes.txt",
      size: text.length,
      mimeType: "text/plain",
    });
    vi.mocked(downloadDriveItemAsBuffer).mockResolvedValue(
      Buffer.from(text, "utf-8")
    );

    const firstPage = getContent(await callTool({ offset: 0, limit: 10 }));
    expect(firstPage).toHaveLength(2);
    expect(parseTextBlock(firstPage[0])).toMatchObject({
      itemId: "item-1",
      content: "abcdefghij",
      nextOffset: 10,
      hasMore: true,
    });
    expect(firstPage[1].type).toBe("resource");

    const secondPage = getContent(await callTool({ offset: 10, limit: 10 }));
    expect(secondPage).toHaveLength(1);
    expect(parseTextBlock(secondPage[0])).toMatchObject({
      content: "klmnopqrst",
    });
  });

  it("paginates the XML content", async () => {
    mockDriveItem({
      name: "doc.docx",
      size: 1024,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    vi.mocked(downloadAndProcessMicrosoftFile).mockResolvedValue(
      "<w:document>0123456789</w:document>"
    );

    const content = getContent(
      await callTool({ offset: 0, limit: 12, getAsXml: true })
    );

    expect(content).toHaveLength(1);
    expect(parseTextBlock(content[0])).toMatchObject({
      content: "<w:document>",
      hasMore: true,
    });
  });
});
