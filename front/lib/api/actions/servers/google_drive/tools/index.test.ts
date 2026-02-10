// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { describe, expect, it } from "vitest";

import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";

import { handleFileAccessError, isFileNotAuthorizedError } from "./index";

describe("isFileNotAuthorizedError", () => {
  it("should return true for authorization keyword errors", () => {
    expect(
      isFileNotAuthorizedError(
        new Error(
          "The user has not granted the app 581863864696 write access to the file"
        )
      )
    ).toBe(true);
    expect(
      isFileNotAuthorizedError(new Error("User has not granted access"))
    ).toBe(true);
    expect(
      isFileNotAuthorizedError(new Error("No write access to this file"))
    ).toBe(true);
  });

  it("should return false for generic 404 errors", () => {
    expect(
      isFileNotAuthorizedError(new Error("Request failed with status code 404"))
    ).toBe(false);
    expect(isFileNotAuthorizedError(new Error("404 Not Found"))).toBe(false);
    expect(isFileNotAuthorizedError(new Error("File not found"))).toBe(false);
    expect(
      isFileNotAuthorizedError(new Error("Error 404: Resource not available"))
    ).toBe(false);
  });

  it("should return false for 'requested entity was not found' errors", () => {
    expect(
      isFileNotAuthorizedError(new Error("Requested entity was not found"))
    ).toBe(false);
    expect(isFileNotAuthorizedError(new Error("404: requested entity"))).toBe(
      false
    );
  });

  it("should return true for Sheets/Slides API permission errors", () => {
    expect(
      isFileNotAuthorizedError(new Error("The caller does not have permission"))
    ).toBe(true);
    expect(
      isFileNotAuthorizedError(
        new Error("Error: The caller does not have permission [403]")
      )
    ).toBe(true);
  });

  it("should return false for other errors", () => {
    expect(isFileNotAuthorizedError(new Error("Permission denied"))).toBe(
      false
    );
    expect(isFileNotAuthorizedError(new Error("403 Forbidden"))).toBe(false);
    expect(isFileNotAuthorizedError(new Error("Internal server error"))).toBe(
      false
    );
    expect(isFileNotAuthorizedError(new Error("Network error"))).toBe(false);
  });

  it("should handle non-Error objects", () => {
    expect(isFileNotAuthorizedError("has not granted")).toBe(true);
    expect(isFileNotAuthorizedError({ message: "write access" })).toBe(true);
    expect(isFileNotAuthorizedError("some other error")).toBe(false);
  });

  it("should handle null and undefined", () => {
    expect(isFileNotAuthorizedError(null)).toBe(false);
    expect(isFileNotAuthorizedError(undefined)).toBe(false);
  });
});

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

  it("should return authorization error for permission keyword errors", async () => {
    const result = await handleFileAccessError(
      new Error("The user has not granted write access"),
      "test-file-id",
      createMockExtra("my-connection"),
      { name: "test-file.txt", mimeType: "text/plain" }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const content = result.value;
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe("resource");
      if (content[0].type === "resource") {
        expect(content[0].resource).toMatchObject({
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          type: "tool_file_auth_required",
          fileId: "test-file-id",
          fileName: "test-file.txt",
          connectionId: "my-connection",
        });
      }
    }
  });

  it("should use fileId as fileName when not provided", async () => {
    const result = await handleFileAccessError(
      new Error("caller does not have permission"),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const content = result.value;
      if (content[0].type === "resource") {
        expect(content[0].resource).toMatchObject({
          fileName: "test-file-id",
        });
      }
    }
  });

  it("should use default connectionId when agentLoopContext is not available", async () => {
    const result = await handleFileAccessError(
      new Error("has not granted"),
      "test-file-id",
      createMockExtra()
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const content = result.value;
      if (content[0].type === "resource") {
        expect(content[0].resource).toMatchObject({
          connectionId: "google_drive",
        });
      }
    }
  });

  it("should return MCPError for 404 errors when metadata fetch fails", async () => {
    const result = await handleFileAccessError(
      new Error("404 Not Found"),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      // Since we can't fetch metadata without auth, we get the original error
      expect(result.error.message).toBe("404 Not Found");
    }
  });

  it("should return MCPError for other errors", async () => {
    const result = await handleFileAccessError(
      new Error("Permission denied"),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Permission denied");
    }
  });

  it("should return generic message for errors without message", async () => {
    const result = await handleFileAccessError(
      new Error(""),
      "test-file-id",
      createMockExtra("my-connection")
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Failed to access file");
    }
  });
});
