import {
  DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA,
  DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_DOCUMENT_TIME_FRAME_METADATA,
  DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_AND_DOCUMENT_TIME_FRAME_METADATA,
  DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA,
  FILESYSTEM_SEARCH_TOOL_NAME,
} from "@app/lib/api/actions/servers/data_sources_file_system/metadata";
import { describe, expect, it } from "vitest";

describe("data_sources_file_system metadata", () => {
  it("gates the semantic search documentTimeFrame input behind dedicated metadata variants", () => {
    expect(
      DATA_SOURCES_FILE_SYSTEM_TOOLS_METADATA[FILESYSTEM_SEARCH_TOOL_NAME]
        .schema
    ).not.toHaveProperty("documentTimeFrame");
    expect(
      DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_METADATA[
        FILESYSTEM_SEARCH_TOOL_NAME
      ].schema
    ).not.toHaveProperty("documentTimeFrame");

    expect(
      DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_DOCUMENT_TIME_FRAME_METADATA[
        FILESYSTEM_SEARCH_TOOL_NAME
      ].schema
    ).toHaveProperty("documentTimeFrame");
    expect(
      DATA_SOURCES_FILE_SYSTEM_TOOLS_WITH_TAGS_AND_DOCUMENT_TIME_FRAME_METADATA[
        FILESYSTEM_SEARCH_TOOL_NAME
      ].schema
    ).toHaveProperty("documentTimeFrame");
  });
});
