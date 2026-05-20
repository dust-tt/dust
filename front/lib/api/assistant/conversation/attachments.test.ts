import {
  getAttachmentFromContentNodeContentFragment,
  getAttachmentFromFileContentFragment,
  makeFileAttachment,
  renderAttachmentXml,
} from "@app/lib/api/assistant/conversation/attachments";
import type {
  ContentNodeContentFragmentType,
  FileContentFragmentType,
} from "@app/types/content_fragment";
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

function makeFileContentFragment({
  isInProjectContext = false,
  skipFileProcessing = false,
  snippet = "snippet",
}: {
  isInProjectContext?: boolean;
  skipFileProcessing?: boolean;
  snippet?: string | null;
}): FileContentFragmentType {
  return {
    type: "content_fragment",
    id: 1,
    sId: "cf_123",
    created: Date.now(),
    visibility: "visible",
    version: 1,
    rank: 0,
    branchId: null,
    sourceUrl: null,
    title: "data.csv",
    contentType: "text/csv",
    context: {
      username: null,
      fullName: null,
      email: null,
      profilePictureUrl: null,
    },
    contentFragmentId: "cf_123",
    contentFragmentVersion: "latest",
    expiredReason: null,
    contentFragmentType: "file",
    path: "conversation/data.csv",
    skipFileProcessing,
    fileId: "fil_123",
    snippet,
    generatedTables: [],
    textUrl: "",
    textBytes: null,
    sourceProvider: null,
    sourceIcon: null,
    isInProjectContext,
    hidden: false,
  };
}

function makeContentNodeContentFragment({
  sourceUrl = null,
}: {
  sourceUrl?: string | null;
}): ContentNodeContentFragmentType & { expiredReason: null } {
  return {
    type: "content_fragment",
    id: 1,
    sId: "cf_node_123",
    created: Date.now(),
    visibility: "visible",
    version: 1,
    rank: 0,
    branchId: null,
    sourceUrl,
    title: "dashboard.tsx",
    contentType: "text/plain",
    context: {
      username: null,
      fullName: null,
      email: null,
      profilePictureUrl: null,
    },
    contentFragmentId: "cf_node_123",
    contentFragmentVersion: "latest",
    expiredReason: null,
    contentFragmentType: "content_node",
    nodeId: "node_abc",
    nodeDataSourceViewId: "dsv_xyz",
    nodeType: "document",
    contentNodeData: {
      nodeId: "node_abc",
      nodeDataSourceViewId: "dsv_xyz",
      nodeType: "document",
      provider: null,
      spaceName: "My Space",
    },
  };
}

describe("renderAttachmentXml", () => {
  it("always includes nodeId for content node attachments even when sourceUrl is null", () => {
    const attachment = getAttachmentFromContentNodeContentFragment(
      makeContentNodeContentFragment({ sourceUrl: null })
    );

    const xml = renderAttachmentXml({ attachment });

    expect(xml).toContain('nodeId="node_abc"');
    expect(xml).not.toContain("sourceUrl");
  });

  it("includes both nodeId and sourceUrl for content node attachments with a source URL", () => {
    const attachment = getAttachmentFromContentNodeContentFragment(
      makeContentNodeContentFragment({ sourceUrl: "https://example.com/doc" })
    );

    const xml = renderAttachmentXml({ attachment });

    expect(xml).toContain('nodeId="node_abc"');
    expect(xml).toContain('sourceUrl="https://example.com/doc"');
  });
});

describe("getAttachmentFromFileContentFragment", () => {
  it("suppresses queryable and includable hints for raw sandbox delimited files", () => {
    const attachment = getAttachmentFromFileContentFragment(
      makeFileContentFragment({ skipFileProcessing: true })
    );

    expect(attachment?.isQueryable).toBe(false);
    expect(attachment?.isIncludable).toBe(false);
    expect(attachment?.generatedTables).toEqual([]);
    expect(attachment?.path).toBe("conversation/data.csv");
  });

  it("keeps old-style CSV files queryable when skipFileProcessing is false", () => {
    const attachment = getAttachmentFromFileContentFragment(
      makeFileContentFragment({ skipFileProcessing: false })
    );

    expect(attachment?.isQueryable).toBe(true);
    expect(attachment?.isIncludable).toBe(true);
    expect(attachment?.generatedTables).toEqual(["fil_123"]);
  });

  it("does not suppress project-context CSV hints", () => {
    const attachment = getAttachmentFromFileContentFragment(
      makeFileContentFragment({
        isInProjectContext: true,
        skipFileProcessing: true,
      })
    );

    expect(attachment?.isQueryable).toBe(true);
    expect(attachment?.isIncludable).toBe(true);
  });
});
