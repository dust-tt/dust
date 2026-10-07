import { conversationAttachmentToRow } from "@app/components/assistant/conversation/files_panel/utils";
import type { ContentNodeAttachmentType } from "@app/types/api/assistant/conversation/attachments";
import { afterEach, describe, expect, it, vi } from "vitest";

function makeNodeAttachment(
  sourceUrl: string | null
): ContentNodeAttachmentType {
  return {
    title: "Doc",
    contentType: "text/plain",
    contentFragmentVersion: "latest",
    snippet: null,
    generatedTables: [],
    isIncludable: true,
    isSearchable: true,
    isQueryable: false,
    isInProjectContext: false,
    creator: null,
    hidden: false,
    contentFragmentId: "cf-1",
    nodeId: "node-1",
    nodeDataSourceViewId: "dsv-1",
    nodeType: "document",
    sourceUrl,
  };
}

describe("conversationAttachmentToRow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("omits the click handler for a non-http(s) sourceUrl", () => {
    const row = conversationAttachmentToRow(
      makeNodeAttachment("javascript:alert(1)"),
      vi.fn()
    );
    expect(row.onClick).toBeUndefined();
  });

  it("omits the click handler when there is no sourceUrl", () => {
    const row = conversationAttachmentToRow(makeNodeAttachment(null), vi.fn());
    expect(row.onClick).toBeUndefined();
  });

  it("opens an http(s) sourceUrl in a new tab without opener access", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const row = conversationAttachmentToRow(
      makeNodeAttachment("https://example.com/doc"),
      vi.fn()
    );
    row.onClick?.();
    expect(open).toHaveBeenCalledWith(
      "https://example.com/doc",
      "_blank",
      "noopener,noreferrer"
    );
  });
});
