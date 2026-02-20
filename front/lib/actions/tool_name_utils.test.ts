import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import { describe, expect, it } from "vitest";

describe("getPrefixedToolName", () => {
  const mockServerName = "Test Server";

  it("should correctly prefix and slugify tool names", () => {
    const result = getPrefixedToolName(mockServerName, "My Tool");
    expect(result).toBe(`test_server${TOOL_NAME_SEPARATOR}my_tool`);
  });

  it("should correctly prefix and slugify tool names with special characters", () => {
    const result = getPrefixedToolName(mockServerName, "My Tool (123) $");
    expect(result).toBe(`test_server${TOOL_NAME_SEPARATOR}my_tool_123_`);
  });

  it("should handle tool names that are too long for prefixing", () => {
    const longToolName = "a".repeat(60);
    const result = getPrefixedToolName(mockServerName, longToolName);
    expect(result).toBe("a".repeat(60));
  });

  it("should handle tool names that are too long to use at all", () => {
    const extremelyLongName = "a".repeat(65);
    expect(() =>
      getPrefixedToolName(mockServerName, extremelyLongName)
    ).toThrow(
      new Error(
        `Tool name "${extremelyLongName}" is too long. Maximum length is 64 characters.`
      )
    );
  });

  it("should truncate server name when needed", () => {
    const longServerName = "a".repeat(100);
    const shortToolName = "tool";
    const result = getPrefixedToolName(longServerName, shortToolName);
    const expectedServerNameLength =
      64 - shortToolName.length - TOOL_NAME_SEPARATOR.length;
    expect(result).toBe(
      `a`.repeat(expectedServerNameLength) + TOOL_NAME_SEPARATOR + shortToolName
    );
  });

  it("should handle minimum prefix length requirement", () => {
    const shortServerName = "ab";
    const longToolName = "a".repeat(60);
    const result = getPrefixedToolName(shortServerName, longToolName);
    expect(result).toBe("a".repeat(60));
  });
});
