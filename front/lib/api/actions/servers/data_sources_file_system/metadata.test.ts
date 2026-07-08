import {
  DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA,
  DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA,
  FILESYSTEM_SEARCH_TOOL_NAME,
} from "@app/lib/api/actions/servers/data_sources_file_system/metadata";
import { describe, expect, it } from "vitest";

describe("data_sources_file_system metadata", () => {
  it("exposes the semantic search documentTimeFrame input by default", () => {
    expect(
      DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA[FILESYSTEM_SEARCH_TOOL_NAME]
        .schema
    ).toHaveProperty("documentTimeFrame");
    expect(
      DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA[
        FILESYSTEM_SEARCH_TOOL_NAME
      ].schema
    ).toHaveProperty("documentTimeFrame");
  });
});
