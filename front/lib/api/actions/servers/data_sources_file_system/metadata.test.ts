import {
  DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA,
  DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_MAX_AGE_METADATA,
  DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_AND_MAX_AGE_METADATA,
  DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA,
  FILESYSTEM_SEARCH_TOOL_NAME,
} from "@app/lib/api/actions/servers/data_sources_file_system/metadata";
import { describe, expect, it } from "vitest";

describe("data_sources_file_system metadata", () => {
  it("gates the semantic search maxAgeSeconds input behind dedicated metadata variants", () => {
    expect(
      DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA[FILESYSTEM_SEARCH_TOOL_NAME]
        .schema
    ).not.toHaveProperty("maxAgeSeconds");
    expect(
      DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA[
        FILESYSTEM_SEARCH_TOOL_NAME
      ].schema
    ).not.toHaveProperty("maxAgeSeconds");

    expect(
      DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_MAX_AGE_METADATA[
        FILESYSTEM_SEARCH_TOOL_NAME
      ].schema
    ).toHaveProperty("maxAgeSeconds");
    expect(
      DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_AND_MAX_AGE_METADATA[
        FILESYSTEM_SEARCH_TOOL_NAME
      ].schema
    ).toHaveProperty("maxAgeSeconds");
  });
});
