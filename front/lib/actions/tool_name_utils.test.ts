import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import {
  getPrefixedToolName,
  getModelFacingToolNames,
  wouldDropToolNamePrefix,
} from "@app/lib/actions/tool_name_utils";
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

  it("should prefix an underscore when the prefixed name starts with a digit", () => {
    const result = getPrefixedToolName("1Password", "get item");
    expect(result).toBe(`_1password${TOOL_NAME_SEPARATOR}get_item`);
  });

  it("should prefix an underscore when the unprefixed name starts with a digit", () => {
    const shortServerName = "ab";
    const longToolName = "3" + "a".repeat(59);
    const result = getPrefixedToolName(shortServerName, longToolName);
    expect(result).toBe("_3" + "a".repeat(59));
  });
});

describe("wouldDropToolNamePrefix", () => {
  // Enforces the `dropped-prefix-detection` contract: true exactly when
  // `getPrefixedToolName` returns the bare tool name.
  it("matches getPrefixedToolName's dropped-prefix regime around the threshold", () => {
    // 59 slugified chars still leave room for a 3-char prefix plus separator; 60 do not.
    expect(wouldDropToolNamePrefix("a".repeat(59))).toBe(false);
    expect(getPrefixedToolName("Test Server", "a".repeat(59))).toBe(
      `tes${TOOL_NAME_SEPARATOR}${"a".repeat(59)}`
    );
    expect(wouldDropToolNamePrefix("a".repeat(60))).toBe(true);
    expect(getPrefixedToolName("Test Server", "a".repeat(60))).toBe(
      "a".repeat(60)
    );
  });

  it("measures the slugified name, not the raw one", () => {
    // Consecutive spaces collapse to a single underscore, so a long raw name can still take a
    // full prefix.
    const longRawShortSlug = `${"a".repeat(20)}${" ".repeat(25)}${"b".repeat(20)}`;
    expect(wouldDropToolNamePrefix(longRawShortSlug)).toBe(false);
    expect(getPrefixedToolName("Test Server", longRawShortSlug)).toBe(
      `test_server${TOOL_NAME_SEPARATOR}${"a".repeat(20)}_${"b".repeat(20)}`
    );
  });
});

describe("getModelFacingToolNames", () => {
  it("splits tool names by prefixing regime and skips names too long to use", () => {
    const { droppedPrefixNames, prefixedNames } = getModelFacingToolNames(
      "Test Server",
      ["My Tool", "a".repeat(60), "a".repeat(65)]
    );
    expect(prefixedNames).toEqual([
      {
        originalName: "My Tool",
        prefixedName: `test_server${TOOL_NAME_SEPARATOR}my_tool`,
      },
    ]);
    expect(droppedPrefixNames).toEqual(new Set(["a".repeat(60)]));
  });
});
