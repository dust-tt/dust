import { makeFileAttachment } from "@app/lib/api/assistant/conversation/attachments";
import { describe, expect, it } from "vitest";

describe("makeFileAttachment", () => {
  const baseArgs = {
    fileId: "file_123",
    source: "agent" as const,
    contentType: "text/plain" as const,
    title: "output.txt",
    snippet: "some content snippet",
    isInProjectContext: false,
    hideFromUser: true,
  };

  it("should mark offloaded tool output files as not searchable", () => {
    const attachment = makeFileAttachment({
      ...baseArgs,
      skipDataSourceIndexing: true,
    });

    expect(attachment.isSearchable).toBe(false);
  });

  it("should keep web browser files searchable (hideFromUser but no skipDataSourceIndexing)", () => {
    // Web browser tool also sets hideFromUser: true but should remain searchable.
    const attachment = makeFileAttachment({
      ...baseArgs,
      skipDataSourceIndexing: false,
    });

    expect(attachment.isSearchable).toBe(true);
  });

  it("should keep user-uploaded files searchable", () => {
    const attachment = makeFileAttachment({
      ...baseArgs,
      source: "user",
      hideFromUser: false,
    });

    expect(attachment.isSearchable).toBe(true);
  });

  it("should not be searchable when snippet is null regardless of skipDataSourceIndexing", () => {
    const attachment = makeFileAttachment({
      ...baseArgs,
      snippet: null,
      skipDataSourceIndexing: false,
    });

    expect(attachment.isSearchable).toBe(false);
  });
});
