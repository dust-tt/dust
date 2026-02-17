import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { Common } from "googleapis";
import { describe, expect, it } from "vitest";

import { handleFileAccessError } from "./index";

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
