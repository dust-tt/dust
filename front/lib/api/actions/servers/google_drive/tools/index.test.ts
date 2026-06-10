import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { extractTextFromBuffer } from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import { getDriveClient } from "@app/lib/api/actions/servers/google_drive/helpers";
import { Err, Ok } from "@app/types/shared/result";
import { isTextExtractionSupportedContentType } from "@app/types/shared/text_extraction";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { Common } from "googleapis";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildBinaryFileResource, handleFileAccessError, TOOLS } from "./index";

vi.mock("@app/lib/api/actions/servers/google_drive/helpers", () => ({
  getDriveClient: vi.fn(),
  getDocsClient: vi.fn(),
  getSheetsClient: vi.fn(),
  getSlidesClient: vi.fn(),
}));

vi.mock(
  "@app/lib/actions/mcp_internal_actions/utils/attachment_processing",
  () => ({
    extractTextFromBuffer: vi.fn(),
  })
);

// Helper to create a mock GaxiosError
function createGaxiosError(code: number, message: string): Common.GaxiosError {
  const mockConfig = {
    url: "https://test.example.com",
    method: "GET",
  };

  const mockResponse = {
    status: code,
    statusText: message,
    config: mockConfig,
    data: {},
    headers: {},
    request: { responseURL: "https://test.example.com" },
  };

  const error = new Common.GaxiosError(
    message,
    mockConfig as any,
    mockResponse as any
  );
  // Note: code is typed as string but we set it as number to match runtime behavior
  error.code = code as any;
  error.message = message;
  return error;
}

describe("handleFileAccessError", () => {
  const createMockExtra = (toolServerId?: string): ToolHandlerExtra =>
    ({
      authInfo: undefined,
      agentLoopContext: toolServerId
        ? {
            runContext: {
              toolConfiguration: {
                toolServerId,
              },
            },
          }
        : undefined,
    }) as ToolHandlerExtra;

  it("should return file authorization error for 403 with 'has not granted' message", async () => {
    const result = await handleFileAccessError(
      createGaxiosError(403, "The user has not granted the app write access"),
      "test-file-id",
      createMockExtra("my-connection"),
      { name: "test-file.txt", mimeType: "text/plain" }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const content = result.value;
      expect(content).toHaveLength(1);
      const item = content[0] as any;
      expect(item.type).toBe("resource");
      expect(item.resource).toMatchObject({
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
        type: "tool_file_auth_required",
        fileId: "test-file-id",
        fileName: "test-file.txt",
        connectionId: "my-connection",
      });
    }
  });

  it("should return file authorization error for 403 with 'caller does not have permission'", async () => {
    const result = await handleFileAccessError(
      createGaxiosError(403, "The caller does not have permission"),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const content = result.value;
      const item = content[0] as any;
      expect(item.type).toBe("resource");
      expect(item.resource).toMatchObject({
        fileName: "test-file-id",
        fileId: "test-file-id",
      });
    }
  });

  it("should return file authorization error for 404 with permission keywords", async () => {
    const result = await handleFileAccessError(
      createGaxiosError(404, "File not found: has not granted write access"),
      "test-file-id",
      createMockExtra()
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const content = result.value;
      const item = content[0] as any;
      expect(item.type).toBe("resource");
      expect(item.resource).toMatchObject({
        connectionId: "google_drive",
      });
    }
  });

  it("should return OAuth re-auth for general 403 errors without permission keywords", async () => {
    const result = await handleFileAccessError(
      createGaxiosError(403, "Forbidden"),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const content = result.value;
      expect(content).toHaveLength(1);
      const item = content[0] as any;
      expect(item.type).toBe("resource");
      expect(item.resource.type).toBe("tool_personal_auth_required");
    }
  });

  it("should return MCPError for 404 without permission keywords", async () => {
    const result = await handleFileAccessError(
      createGaxiosError(404, "Not Found"),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      // Since we can't fetch metadata without auth, we get the original error
      expect(result.error.message).toBe("Not Found");
    }
  });

  it("should return MCPError for non-GaxiosError errors", async () => {
    const result = await handleFileAccessError(
      new Error("Network error"),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Network error");
    }
  });

  it("should return generic message for GaxiosError without message", async () => {
    const error = createGaxiosError(500, "Internal Server Error");
    // Simulate an error without a message
    error.message = undefined as any;

    const result = await handleFileAccessError(
      error,
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Failed to access file");
    }
  });
});

describe("buildBinaryFileResource", () => {
  it("should base64-encode the buffer and preserve the mime type", () => {
    const buffer = Buffer.from("Hello PDF", "utf-8");

    const block = buildBinaryFileResource({
      buffer,
      fileName: "report.pdf",
      mimeType: "application/pdf",
    });

    expect(block.type).toBe("resource");
    expect(block.resource.mimeType).toBe("application/pdf");
    expect(block.resource.blob).toBe(buffer.toString("base64"));
    expect(block.resource.uri).toBe("report.pdf");
    expect(block.resource._meta).toEqual({ text: "File: report.pdf" });
  });

  it("should fall back to 'unknown' when the file name is missing", () => {
    const block = buildBinaryFileResource({
      buffer: Buffer.from(""),
      fileName: null,
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    expect(block.resource.uri).toBe("unknown");
    expect(block.resource._meta).toEqual({ text: "File: unknown" });
  });

  it("should sanitize file names with unsafe characters", () => {
    const block = buildBinaryFileResource({
      buffer: Buffer.from("x"),
      fileName: "../../etc/passwd",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    expect(block.resource.uri).not.toContain("/");
    expect(block.resource.uri).not.toContain("..");
    expect(block.resource._meta.text).toBe(`File: ${block.resource.uri}`);
  });
});

describe("get_file_content", () => {
  const XLSX_MIMETYPE =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const extra = {
    authInfo: undefined,
    agentLoopContext: undefined,
  } as ToolHandlerExtra;

  // Builds the ArrayBuffer with the global constructor so the handler's
  // `instanceof ArrayBuffer` check passes under the jsdom test environment.
  function toArrayBuffer(content: string): ArrayBuffer {
    const arrayBuffer = new ArrayBuffer(content.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < content.length; i++) {
      view[i] = content.charCodeAt(i);
    }
    return arrayBuffer;
  }

  function createFakeDrive() {
    return {
      files: {
        get: vi.fn(),
        export: vi.fn(),
      },
    };
  }

  function mockDrive(fakeDrive: ReturnType<typeof createFakeDrive>) {
    vi.mocked(getDriveClient).mockResolvedValue(
      fakeDrive as unknown as Awaited<ReturnType<typeof getDriveClient>>
    );
  }

  async function callTool(fileId: string) {
    const tool = TOOLS.find((t) => t.name === "get_file_content");
    if (!tool) {
      throw new Error("get_file_content tool not found");
    }
    return tool.handler({ fileId, offset: 0, limit: 32000 }, extra);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // `@app/types/shared/text_extraction` is globally mocked in vite.setup.ts;
    // mirror the real behavior of marking only Tika-supported types.
    vi.mocked(isTextExtractionSupportedContentType).mockImplementation(
      (contentType: string) =>
        contentType === "application/pdf" || contentType === XLSX_MIMETYPE
    );
  });

  it("downloads a non-native binary file (XLSX) and attaches it as a resource", async () => {
    const fakeDrive = createFakeDrive();
    fakeDrive.files.get.mockImplementation(async (params: { alt?: string }) => {
      if (params.alt === "media") {
        return { data: toArrayBuffer("xlsx-bytes") };
      }
      return {
        data: {
          id: "f1",
          name: "data.xlsx",
          mimeType: XLSX_MIMETYPE,
          size: "1000",
          capabilities: {},
        },
      };
    });
    mockDrive(fakeDrive);
    vi.mocked(extractTextFromBuffer).mockResolvedValue(new Ok("a,b,c"));

    const result = await callTool("f1");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [textBlock, resourceBlock] = result.value as any[];
      const payload = JSON.parse(textBlock.text);
      expect(payload.mimeType).toBe(XLSX_MIMETYPE);
      expect(payload.content).toBe("a,b,c");
      expect(resourceBlock.type).toBe("resource");
      expect(resourceBlock.resource.mimeType).toBe(XLSX_MIMETYPE);
      expect(resourceBlock.resource.uri).toBe("data.xlsx");
      expect(resourceBlock.resource.blob).toBe(
        Buffer.from("xlsx-bytes").toString("base64")
      );
    }
  });

  it("attaches files without text extraction support (PNG) with a placeholder", async () => {
    const fakeDrive = createFakeDrive();
    fakeDrive.files.get.mockImplementation(async (params: { alt?: string }) => {
      if (params.alt === "media") {
        return { data: toArrayBuffer("png-bytes") };
      }
      return {
        data: {
          id: "f1",
          name: "chart.png",
          mimeType: "image/png",
          size: "1000",
          capabilities: {},
        },
      };
    });
    mockDrive(fakeDrive);

    const result = await callTool("f1");

    expect(extractTextFromBuffer).not.toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [textBlock, resourceBlock] = result.value as any[];
      const payload = JSON.parse(textBlock.text);
      expect(payload.content).toContain("No text extraction available");
      expect(resourceBlock.resource.mimeType).toBe("image/png");
      expect(resourceBlock.resource.uri).toBe("chart.png");
    }
  });

  it("exports Google Sheets as XLSX and attaches the file", async () => {
    const fakeDrive = createFakeDrive();
    fakeDrive.files.get.mockResolvedValue({
      data: {
        id: "f1",
        name: "Budget",
        mimeType: "application/vnd.google-apps.spreadsheet",
        capabilities: {},
      },
    });
    fakeDrive.files.export.mockResolvedValue({
      data: toArrayBuffer("exported-xlsx"),
    });
    mockDrive(fakeDrive);
    vi.mocked(extractTextFromBuffer).mockResolvedValue(new Ok("rows"));

    const result = await callTool("f1");

    expect(fakeDrive.files.export).toHaveBeenCalledWith(
      { fileId: "f1", mimeType: XLSX_MIMETYPE },
      { responseType: "arraybuffer" }
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [textBlock, resourceBlock] = result.value as any[];
      const payload = JSON.parse(textBlock.text);
      expect(payload.content).toBe("rows");
      expect(resourceBlock.resource.mimeType).toBe(XLSX_MIMETYPE);
      expect(resourceBlock.resource.uri).toBe("Budget.xlsx");
    }
  });

  it("attaches the binary resource with a placeholder when extraction fails", async () => {
    const fakeDrive = createFakeDrive();
    fakeDrive.files.get.mockImplementation(async (params: { alt?: string }) => {
      if (params.alt === "media") {
        return { data: toArrayBuffer("pdf-bytes") };
      }
      return {
        data: {
          id: "f1",
          name: "scan.pdf",
          mimeType: "application/pdf",
          size: "1000",
          capabilities: {},
        },
      };
    });
    mockDrive(fakeDrive);
    vi.mocked(extractTextFromBuffer).mockResolvedValue(
      new Err("extraction failed")
    );

    const result = await callTool("f1");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [textBlock, resourceBlock] = result.value as any[];
      const payload = JSON.parse(textBlock.text);
      expect(payload.content).toContain("Text extraction failed");
      expect(resourceBlock.resource.uri).toBe("scan.pdf");
    }
  });

  it("errors on Google-native types without a binary representation", async () => {
    const fakeDrive = createFakeDrive();
    fakeDrive.files.get.mockResolvedValue({
      data: {
        id: "f1",
        name: "My folder",
        mimeType: "application/vnd.google-apps.folder",
        capabilities: {},
      },
    });
    mockDrive(fakeDrive);

    const result = await callTool("f1");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "Unsupported Google-native file type"
      );
    }
  });

  it("resolves shortcuts to their target file", async () => {
    const fakeDrive = createFakeDrive();
    fakeDrive.files.get.mockImplementation(
      async (params: { fileId: string; alt?: string }) => {
        if (params.alt === "media") {
          return { data: toArrayBuffer("target-bytes") };
        }
        if (params.fileId === "shortcut-id") {
          return {
            data: {
              id: "shortcut-id",
              name: "Shortcut to data",
              mimeType: "application/vnd.google-apps.shortcut",
              shortcutDetails: { targetId: "target-id" },
            },
          };
        }
        return {
          data: {
            id: "target-id",
            name: "data.xlsx",
            mimeType: XLSX_MIMETYPE,
            size: "1000",
            capabilities: {},
          },
        };
      }
    );
    mockDrive(fakeDrive);
    vi.mocked(extractTextFromBuffer).mockResolvedValue(new Ok("a,b,c"));

    const result = await callTool("shortcut-id");

    expect(result.isOk()).toBe(true);
    expect(fakeDrive.files.get).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "target-id", alt: "media" }),
      { responseType: "arraybuffer" }
    );
    if (result.isOk()) {
      const [, resourceBlock] = result.value as any[];
      expect(resourceBlock.resource.uri).toBe("data.xlsx");
    }
  });
});
