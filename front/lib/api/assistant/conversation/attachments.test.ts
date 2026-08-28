import { DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME } from "@app/lib/actions/constants";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  CONVERSATION_CAT_FILE_ACTION_NAME,
  CONVERSATION_FILES_SERVER_NAME,
  CONVERSATION_SEARCH_FILES_ACTION_NAME,
} from "@app/lib/api/actions/servers/conversation_files/metadata";
import {
  attachmentUsageHintsFor,
  getAttachmentFromContentNodeContentFragment,
  getAttachmentFromFileContentFragment,
  makeFileAttachment,
  renderAttachmentXml,
} from "@app/lib/api/assistant/conversation/attachments";
import type { AttachmentCapabilityContext } from "@app/types/api/assistant/conversation/attachments";
import type {
  ContentNodeContentFragmentType,
  FileContentFragmentType,
} from "@app/types/content_fragment";
import { describe, expect, it } from "vitest";

const CAT_TOOL = getPrefixedToolName(
  CONVERSATION_FILES_SERVER_NAME,
  CONVERSATION_CAT_FILE_ACTION_NAME
);
const SEARCH_TOOL = getPrefixedToolName(
  CONVERSATION_FILES_SERVER_NAME,
  CONVERSATION_SEARCH_FILES_ACTION_NAME
);

function capabilities({
  isNewFileExplorer = false,
  hasSandboxTools = false,
}: Partial<AttachmentCapabilityContext> = {}): AttachmentCapabilityContext {
  return { isNewFileExplorer, hasSandboxTools };
}

const LEGACY = capabilities();

describe("makeFileAttachment", () => {
  const baseArgs = {
    fileId: "file_123",
    source: "agent" as const,
    contentType: "text/plain" as const,
    title: "output.txt",
    snippet: "some content snippet",
    isInProjectContext: false,
    hideFromUser: true,
    capabilities: LEGACY,
  };

  it("should mark pasted text files as not searchable, even with a snippet", () => {
    const attachment = makeFileAttachment({
      ...baseArgs,
      contentType: "text/vnd.dust.attachment.pasted",
    });

    expect(attachment.isSearchable).toBe(false);
  });

  it("should keep user-uploaded files with snippet searchable", () => {
    const attachment = makeFileAttachment({
      ...baseArgs,
      source: "user",
      hideFromUser: false,
    });

    expect(attachment.isSearchable).toBe(true);
  });

  it("should not be searchable when snippet is null regardless", () => {
    const attachment = makeFileAttachment({
      ...baseArgs,
      snippet: null,
    });

    expect(attachment.isSearchable).toBe(false);
  });

  it("disables JIT flags when using the new file explorer", () => {
    const attachment = makeFileAttachment({
      ...baseArgs,
      contentType: "text/csv",
      capabilities: capabilities({ isNewFileExplorer: true }),
    });

    expect(attachment.isQueryable).toBe(false);
    expect(attachment.isIncludable).toBe(false);
    expect(attachment.isSearchable).toBe(false);
  });

  it("disables queryable when sandbox tools are available", () => {
    const attachment = makeFileAttachment({
      ...baseArgs,
      contentType: "text/csv",
      capabilities: capabilities({ hasSandboxTools: true }),
    });

    expect(attachment.isQueryable).toBe(false);
    expect(attachment.isIncludable).toBe(true);
    expect(attachment.isSearchable).toBe(false);
  });
});

function makeFileContentFragment({
  isInProjectContext = false,
  skipFileProcessing = false,
  snippet = "snippet",
  contentType = "text/csv",
}: {
  isInProjectContext?: boolean;
  skipFileProcessing?: boolean;
  snippet?: string | null;
  contentType?: "text/csv" | "text/plain";
}): FileContentFragmentType {
  return {
    type: "content_fragment",
    id: 1,
    sId: "cf_123",
    created: Date.now(),
    visibility: "visible",
    version: 1,
    rank: 0,
    sourceUrl: null,
    title: contentType === "text/plain" ? "data.txt" : "data.csv",
    contentType,
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
  const legacyUsage = attachmentUsageHintsFor(LEGACY);

  it("always includes nodeId for content node attachments even when sourceUrl is null", () => {
    const attachment = getAttachmentFromContentNodeContentFragment({
      cf: makeContentNodeContentFragment({ sourceUrl: null }),
    });

    const xml = renderAttachmentXml({ attachment, usage: legacyUsage });

    expect(xml).toContain('nodeId="node_abc"');
    expect(xml).not.toContain("sourceUrl");
    expect(xml).not.toContain("isIncludable");
    expect(xml).not.toContain("isQueryable");
    expect(xml).not.toContain("isSearchable");
  });

  it("includes both nodeId and sourceUrl for content node attachments with a source URL", () => {
    const attachment = getAttachmentFromContentNodeContentFragment({
      cf: makeContentNodeContentFragment({
        sourceUrl: "https://example.com/doc",
      }),
    });

    const xml = renderAttachmentXml({ attachment, usage: legacyUsage });

    expect(xml).toContain('nodeId="node_abc"');
    expect(xml).toContain('sourceUrl="https://example.com/doc"');
  });

  it("emits a Use line with only applicable tools", () => {
    const csvAttachment = getAttachmentFromFileContentFragment({
      cf: makeFileContentFragment({ skipFileProcessing: false }),
      capabilities: LEGACY,
    });

    const csvXml = renderAttachmentXml({
      attachment: csvAttachment!,
      usage: legacyUsage,
    });

    expect(csvXml).toContain(
      `Use: read with \`${CAT_TOOL}\`; query tabular data with \`${DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME}\`.`
    );
    expect(csvXml).not.toContain(SEARCH_TOOL);
    expect(csvXml).toContain("snippet");
    expect(csvXml).not.toContain("isIncludable");

    const textAttachment = getAttachmentFromFileContentFragment({
      cf: makeFileContentFragment({
        contentType: "text/plain",
        skipFileProcessing: false,
      }),
      capabilities: LEGACY,
    });

    const textXml = renderAttachmentXml({
      attachment: textAttachment!,
      usage: legacyUsage,
    });

    expect(textXml).toContain(
      `Use: read with \`${CAT_TOOL}\`; semantic search with \`${SEARCH_TOOL}\`.`
    );
    expect(textXml).not.toContain(
      DEFAULT_CONVERSATION_QUERY_TABLES_ACTION_NAME
    );
  });

  it("omits the Use line when no tools apply", () => {
    const attachment = getAttachmentFromFileContentFragment({
      cf: makeFileContentFragment({
        contentType: "text/plain",
        snippet: null,
      }),
      capabilities: capabilities({ isNewFileExplorer: true }),
    });

    const xml = renderAttachmentXml({
      attachment: attachment!,
      usage: legacyUsage,
    });

    expect(xml).not.toContain("Use:");
    expect(xml).toMatch(/<attachment [^>]+\/>/);
  });

  it("omits the Use line entirely when the content is inlined", () => {
    const attachment = getAttachmentFromFileContentFragment({
      cf: makeFileContentFragment({ contentType: "text/plain" }),
      capabilities: LEGACY,
    });

    const xml = renderAttachmentXml({
      attachment: attachment!,
      content: "the full file content",
      usage: null,
    });

    expect(xml).not.toContain("Use:");
    expect(xml).toContain("the full file content");
  });

  it("does not advertise semantic search when the file system tools are registered", () => {
    // Content nodes stay searchable in file system mode, but conversation_files does not register
    // semantic_search there, so the Use line must not point at it.
    const attachment = getAttachmentFromContentNodeContentFragment({
      cf: makeContentNodeContentFragment({ sourceUrl: null }),
    });
    expect(attachment.isSearchable).toBe(true);

    const xml = renderAttachmentXml({
      attachment,
      usage: attachmentUsageHintsFor(capabilities({ isNewFileExplorer: true })),
    });

    expect(xml).not.toContain(SEARCH_TOOL);
    expect(xml).toContain(`Use: read with \`${CAT_TOOL}\`.`);
  });
});

describe("getAttachmentFromFileContentFragment", () => {
  it("keeps skipped text files without snippet includable without advertising semantic search", () => {
    const attachment = getAttachmentFromFileContentFragment({
      cf: makeFileContentFragment({
        contentType: "text/plain",
        snippet: null,
      }),
      capabilities: LEGACY,
    });

    // Without a snippet, canDoJIT is false so all JIT flags stay off.
    expect(attachment?.isIncludable).toBe(false);
    expect(attachment?.isSearchable).toBe(false);
  });

  it("suppresses queryable and includable hints for raw sandbox delimited files", () => {
    const attachment = getAttachmentFromFileContentFragment({
      cf: makeFileContentFragment({ skipFileProcessing: true }),
      capabilities: LEGACY,
    });

    expect(attachment?.isQueryable).toBe(false);
    expect(attachment?.isIncludable).toBe(false);
    expect(attachment?.generatedTables).toEqual([]);
    expect(attachment?.path).toBe("conversation/data.csv");
  });

  it("keeps old-style CSV files queryable when skipFileProcessing is false", () => {
    const attachment = getAttachmentFromFileContentFragment({
      cf: makeFileContentFragment({ skipFileProcessing: false }),
      capabilities: LEGACY,
    });

    expect(attachment?.isQueryable).toBe(true);
    expect(attachment?.isIncludable).toBe(true);
    expect(attachment?.generatedTables).toEqual(["fil_123"]);
  });

  it("does not suppress project-context CSV hints", () => {
    const attachment = getAttachmentFromFileContentFragment({
      cf: makeFileContentFragment({
        isInProjectContext: true,
        skipFileProcessing: true,
      }),
      capabilities: LEGACY,
    });

    expect(attachment?.isQueryable).toBe(true);
    expect(attachment?.isIncludable).toBe(true);
  });

  it("disables JIT flags when using the new file explorer", () => {
    const attachment = getAttachmentFromFileContentFragment({
      cf: makeFileContentFragment({ skipFileProcessing: false }),
      capabilities: capabilities({ isNewFileExplorer: true }),
    });

    expect(attachment?.isQueryable).toBe(false);
    expect(attachment?.isIncludable).toBe(false);
    expect(attachment?.isSearchable).toBe(false);
  });

  it("disables queryable when sandbox tools are available", () => {
    const attachment = getAttachmentFromFileContentFragment({
      cf: makeFileContentFragment({ skipFileProcessing: false }),
      capabilities: capabilities({ hasSandboxTools: true }),
    });

    expect(attachment?.isQueryable).toBe(false);
    expect(attachment?.isIncludable).toBe(true);
    // CSV is queryable/includable but not semantically searchable.
    expect(attachment?.isSearchable).toBe(false);
  });
});
