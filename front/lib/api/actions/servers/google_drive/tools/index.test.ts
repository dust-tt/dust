import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { extractTextFromBuffer } from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import { getDriveClient } from "@app/lib/api/actions/servers/google_drive/helpers";
import { Err, Ok } from "@app/types/shared/result";
import { isTextExtractionSupportedContentType } from "@app/types/shared/text_extraction";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { Common } from "googleapis";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BinaryFileResourceBlock } from "./index";
import {
  buildBinaryFileResource,
  GOOGLE_DRIVE_TOOL_HANDLERS,
  handleFileAccessError,
} from "./index";

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
function createGaxiosError(
  code: number,
  message: string,
  reason?: string | string[]
): Common.GaxiosError {
  const mockConfig = {
    url: "https://test.example.com",
    method: "GET",
  };

  const reasons = reason === undefined ? [] : [reason].flat();
  const mockResponse = {
    status: code,
    statusText: message,
    config: mockConfig,
    data:
      reasons.length > 0
        ? {
            error: {
              code,
              message,
              errors: reasons.map((r) => ({ reason: r, message })),
            },
          }
        : {},
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

function isTextBlock(block: unknown): block is { type: "text"; text: string } {
  return (
    typeof block === "object" &&
    block !== null &&
    "type" in block &&
    block.type === "text" &&
    "text" in block &&
    typeof block.text === "string"
  );
}

describe("handleFileAccessError", () => {
  const createMockExtra = (toolServerId: string): ToolHandlerExtra =>
    ({
      authInfo: undefined,
      runContext: {
        toolConfiguration: {
          toolServerId,
        },
      },
    }) as ToolHandlerExtra;

  beforeEach(() => {
    // Default: no drive client, so the token-validity probe reports invalid.
    vi.mocked(getDriveClient).mockReset();
  });

  it("should return file authorization error for 403 with 'has not granted' message", async () => {
    const result = await handleFileAccessError(
      createGaxiosError(403, "The user has not granted the app write access"),
      "test-file-id",
      createMockExtra("my-connection"),
      { name: "test-file.txt", mimeType: "text/plain" }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({
        type: "resource",
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          type: "tool_file_auth_required",
          fileId: "test-file-id",
          fileName: "test-file.txt",
          connectionId: "my-connection",
        },
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
      expect(result.value[0]).toMatchObject({
        type: "resource",
        resource: {
          fileName: "test-file-id",
          fileId: "test-file-id",
        },
      });
    }
  });

  it("should return file authorization error for 404 with permission keywords", async () => {
    const result = await handleFileAccessError(
      createGaxiosError(404, "File not found: has not granted write access"),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]).toMatchObject({
        type: "resource",
        resource: {
          connectionId: "my-connection",
        },
      });
    }
  });

  it("should return a non-auth error for 403 export size limit errors", async () => {
    const result = await handleFileAccessError(
      createGaxiosError(403, "This file is too large to be exported."),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("too large to be exported");
    }
  });

  it("should return OAuth re-auth for general 403 errors when the token is invalid", async () => {
    // getDriveClient resolves to undefined, so the token-validity probe fails.
    const result = await handleFileAccessError(
      createGaxiosError(403, "Forbidden"),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({
        type: "resource",
        resource: { type: "tool_personal_auth_required" },
      });
    }
  });

  it("should return a permission error for general 403 errors when the token is valid", async () => {
    const aboutGet = vi.fn().mockResolvedValue({ data: { user: {} } });
    vi.mocked(getDriveClient).mockResolvedValue({
      about: { get: aboutGet },
    } as unknown as Awaited<ReturnType<typeof getDriveClient>>);

    const result = await handleFileAccessError(
      createGaxiosError(403, "Forbidden"),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(aboutGet).toHaveBeenCalled();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("does not have permission");
    }
  });

  it("should return a rate-limit error for 403 with a rate-limit reason", async () => {
    const result = await handleFileAccessError(
      createGaxiosError(
        403,
        "User rate limit exceeded.",
        "userRateLimitExceeded"
      ),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("rate limiting");
    }
  });

  it("should return a permission error for 403 with a permission reason without probing the token", async () => {
    const aboutGet = vi.fn().mockResolvedValue({ data: { user: {} } });
    vi.mocked(getDriveClient).mockResolvedValue({
      about: { get: aboutGet },
    } as unknown as Awaited<ReturnType<typeof getDriveClient>>);

    const result = await handleFileAccessError(
      createGaxiosError(
        403,
        "Insufficient permissions for the specified parent",
        "insufficientParentPermissions"
      ),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(aboutGet).not.toHaveBeenCalled();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("does not have permission");
    }
  });

  it("should return OAuth re-auth for 403 with an insufficient-scope reason even when the token is valid", async () => {
    vi.mocked(getDriveClient).mockResolvedValue({
      about: { get: vi.fn().mockResolvedValue({ data: { user: {} } }) },
    } as unknown as Awaited<ReturnType<typeof getDriveClient>>);

    const result = await handleFileAccessError(
      createGaxiosError(
        403,
        "Insufficient Permission: Request had insufficient authentication scopes.",
        "insufficientPermissions"
      ),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]).toMatchObject({
        type: "resource",
        resource: { type: "tool_personal_auth_required" },
      });
    }
  });

  it("should return OAuth re-auth for 401 errors", async () => {
    const result = await handleFileAccessError(
      createGaxiosError(401, "Invalid Credentials", "authError"),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]).toMatchObject({
        type: "resource",
        resource: { type: "tool_personal_auth_required" },
      });
    }
  });

  it("should skip the file picker and return a permission error when Google reports a user-level permission denial", async () => {
    // Message matches the picker keywords, but the structured reason says the
    // user lacks rights on the file: re-picking cannot help.
    const result = await handleFileAccessError(
      createGaxiosError(
        403,
        "The caller does not have permission",
        "insufficientFilePermissions"
      ),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("does not have permission");
    }
  });

  it("should return file authorization error for 403 with the appNotAuthorizedToFile reason", async () => {
    const result = await handleFileAccessError(
      createGaxiosError(
        403,
        "The user has not granted the app access to the file",
        "appNotAuthorizedToFile"
      ),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]).toMatchObject({
        type: "resource",
        resource: { type: "tool_file_auth_required" },
      });
    }
  });

  it("should prefer the file picker when appNotAuthorizedToFile appears alongside a permission reason", async () => {
    // An explicit missing app grant is fixable by the picker even if Google
    // also reports a user-level permission reason in the same error body.
    const result = await handleFileAccessError(
      createGaxiosError(403, "The user has not granted the app access", [
        "insufficientFilePermissions",
        "appNotAuthorizedToFile",
      ]),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]).toMatchObject({
        type: "resource",
        resource: { type: "tool_file_auth_required" },
      });
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

describe("parent folder permission checks", () => {
  const extra = {
    authInfo: undefined,
    runContext: undefined,
  } as unknown as ToolHandlerExtra;

  function expectPermissionError(
    result: Awaited<ReturnType<typeof GOOGLE_DRIVE_TOOL_HANDLERS.copy_file>>
  ) {
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const item = result.value[0];
      if (!isTextBlock(item)) {
        throw new Error("Expected the first block to be a text block");
      }
      expect(JSON.parse(item.text).error).toContain(
        "permission to add files to this folder"
      );
    }
  }

  beforeEach(() => {
    vi.mocked(getDriveClient).mockReset();
  });

  it("copy_file returns a permission error when the destination folder is not writable", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: { capabilities: { canAddChildren: false } },
    });
    const filesCopy = vi.fn();
    vi.mocked(getDriveClient).mockResolvedValue({
      files: { get: filesGet, copy: filesCopy },
    } as unknown as Awaited<ReturnType<typeof getDriveClient>>);

    const result = await GOOGLE_DRIVE_TOOL_HANDLERS.copy_file(
      {
        fileId: "src-file",
        parentId: "restricted-folder",
        capabilities: { canCopy: true },
      },
      extra
    );

    expect(filesGet).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "restricted-folder",
        fields: "capabilities/canAddChildren",
      })
    );
    expect(filesCopy).not.toHaveBeenCalled();
    expectPermissionError(result);
  });

  it("copy_file returns a permission error when the source file cannot be copied", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: { capabilities: { canCopy: false } },
    });
    const filesCopy = vi.fn();
    vi.mocked(getDriveClient).mockResolvedValue({
      files: { get: filesGet, copy: filesCopy },
    } as unknown as Awaited<ReturnType<typeof getDriveClient>>);

    const result = await GOOGLE_DRIVE_TOOL_HANDLERS.copy_file(
      { fileId: "src-file" },
      extra
    );

    expect(filesCopy).not.toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const item = result.value[0];
      if (!isTextBlock(item)) {
        throw new Error("Expected the first block to be a text block");
      }
      expect(JSON.parse(item.text).error).toContain(
        "permission to copy this file"
      );
    }
  });

  it("create_document returns a permission error when the parent folder is not writable", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: { capabilities: { canAddChildren: false } },
    });
    const filesCreate = vi.fn();
    vi.mocked(getDriveClient).mockResolvedValue({
      files: { get: filesGet, create: filesCreate },
    } as unknown as Awaited<ReturnType<typeof getDriveClient>>);

    const result = await GOOGLE_DRIVE_TOOL_HANDLERS.create_document(
      { title: "Doc", parentId: "restricted-folder" },
      extra
    );

    expect(filesCreate).not.toHaveBeenCalled();
    expectPermissionError(result);
  });

  it("create_document proceeds when the parent folder is writable", async () => {
    const filesGet = vi.fn().mockResolvedValue({
      data: { capabilities: { canAddChildren: true } },
    });
    const filesCreate = vi.fn().mockResolvedValue({
      data: { id: "new-doc", name: "Doc", webViewLink: "https://link" },
    });
    vi.mocked(getDriveClient).mockResolvedValue({
      files: { get: filesGet, create: filesCreate },
    } as unknown as Awaited<ReturnType<typeof getDriveClient>>);

    const result = await GOOGLE_DRIVE_TOOL_HANDLERS.create_document(
      { title: "Doc", parentId: "writable-folder" },
      extra
    );

    expect(filesCreate).toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const item = result.value[0];
      if (!isTextBlock(item)) {
        throw new Error("Expected the first block to be a text block");
      }
      expect(JSON.parse(item.text).documentId).toBe("new-doc");
    }
  });

  it("create_document skips the folder check when no parent is given", async () => {
    const filesGet = vi.fn();
    const filesCreate = vi.fn().mockResolvedValue({
      data: { id: "new-doc", name: "Doc", webViewLink: "https://link" },
    });
    vi.mocked(getDriveClient).mockResolvedValue({
      files: { get: filesGet, create: filesCreate },
    } as unknown as Awaited<ReturnType<typeof getDriveClient>>);

    const result = await GOOGLE_DRIVE_TOOL_HANDLERS.create_document(
      { title: "Doc" },
      extra
    );

    expect(filesGet).not.toHaveBeenCalled();
    expect(result.isOk()).toBe(true);
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

  // Partial stub: the get_file_content handler only reads authInfo and runContext.
  // Same pattern as the other MCP tool tests (files/tools).
  const extra = {
    authInfo: undefined,
    runContext: undefined,
  } as unknown as ToolHandlerExtra;

  function isBinaryFileResourceBlock(
    block: unknown
  ): block is BinaryFileResourceBlock {
    return (
      typeof block === "object" &&
      block !== null &&
      "type" in block &&
      block.type === "resource" &&
      "resource" in block &&
      typeof block.resource === "object" &&
      block.resource !== null
    );
  }

  function getBlocks(result: Awaited<ReturnType<typeof callTool>>): {
    payload: Record<string, unknown>;
    resourceBlock: BinaryFileResourceBlock | null;
  } {
    if (result.isErr()) {
      throw new Error(`Expected Ok result, got: ${result.error.message}`);
    }
    const [first, second] = result.value;
    if (!isTextBlock(first)) {
      throw new Error("Expected the first block to be a text block");
    }
    return {
      payload: JSON.parse(first.text),
      resourceBlock: isBinaryFileResourceBlock(second) ? second : null,
    };
  }

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
    // The fake client only implements the methods the handler calls; same
    // mock pattern as the other MCP tool tests (files/tools).
    vi.mocked(getDriveClient).mockResolvedValue(
      fakeDrive as unknown as Awaited<ReturnType<typeof getDriveClient>>
    );
  }

  async function callTool(fileId: string) {
    return GOOGLE_DRIVE_TOOL_HANDLERS.get_file_content(
      { fileId, offset: 0, limit: 32000 },
      extra
    );
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

    const { payload, resourceBlock } = getBlocks(result);
    expect(payload.mimeType).toBe(XLSX_MIMETYPE);
    expect(payload.content).toBe("a,b,c");
    expect(resourceBlock?.resource.mimeType).toBe(XLSX_MIMETYPE);
    expect(resourceBlock?.resource.uri).toBe("data.xlsx");
    expect(resourceBlock?.resource.blob).toBe(
      Buffer.from("xlsx-bytes").toString("base64")
    );
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
    const { payload, resourceBlock } = getBlocks(result);
    expect(payload.content).toContain("No text extraction available");
    expect(resourceBlock?.resource.mimeType).toBe("image/png");
    expect(resourceBlock?.resource.uri).toBe("chart.png");
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
    const { payload, resourceBlock } = getBlocks(result);
    expect(payload.content).toBe("rows");
    expect(resourceBlock?.resource.mimeType).toBe(XLSX_MIMETYPE);
    expect(resourceBlock?.resource.uri).toBe("Budget.xlsx");
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

    const { payload, resourceBlock } = getBlocks(result);
    expect(payload.content).toContain("Text extraction failed");
    expect(resourceBlock?.resource.uri).toBe("scan.pdf");
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

    expect(fakeDrive.files.get).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "target-id", alt: "media" }),
      { responseType: "arraybuffer" }
    );
    const { payload, resourceBlock } = getBlocks(result);
    expect(payload.fileId).toBe("target-id");
    expect(resourceBlock?.resource.uri).toBe("data.xlsx");
  });
});
