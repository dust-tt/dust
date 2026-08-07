import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  CONVERSATION_CAT_FILE_ACTION_NAME,
  CONVERSATION_FILES_SERVER_NAME,
  CONVERSATION_SEARCH_FILES_ACTION_NAME,
} from "@app/lib/api/actions/servers/conversation_files/metadata";
import { attachmentUsageHintsFor } from "@app/lib/api/assistant/conversation/attachments";
import type { FileAttachmentType } from "@app/types/api/assistant/conversation/attachments";
import { describe, expect, it } from "vitest";

import { contentFromAttachments } from "./index";

const CAT_TOOL = getPrefixedToolName(
  CONVERSATION_FILES_SERVER_NAME,
  CONVERSATION_CAT_FILE_ACTION_NAME
);
const SEARCH_TOOL = getPrefixedToolName(
  CONVERSATION_FILES_SERVER_NAME,
  CONVERSATION_SEARCH_FILES_ACTION_NAME
);

// The legacy mode is the one that lists file attachments, so it is what these tests exercise.
const LEGACY_USAGE = attachmentUsageHintsFor({
  isNewFileExplorer: false,
  hasSandboxTools: false,
});

function makeFileAttachment(
  partial: Partial<FileAttachmentType> &
    Pick<FileAttachmentType, "fileId" | "title" | "isInProjectContext">
): FileAttachmentType {
  return {
    contentType: "text/plain",
    contentFragmentVersion: "latest",
    snippet: null,
    generatedTables: [],
    isIncludable: true,
    isSearchable: true,
    isQueryable: false,
    creator: null,
    source: null,
    path: null,
    hidden: false,
    ...partial,
  };
}

describe("contentFromAttachments", () => {
  it("returns an empty string when there are no attachments", () => {
    expect(contentFromAttachments([], { usage: LEGACY_USAGE })).toBe("");
  });

  it("lists direct attachments under the direct header", () => {
    const attachments = [
      makeFileAttachment({
        fileId: "file-direct",
        title: "Notes.txt",
        isInProjectContext: false,
        snippet: "preview",
      }),
    ];

    const out = contentFromAttachments(attachments, { usage: LEGACY_USAGE });

    expect(out).toContain(
      "The following files are currently attached to the conversation directly:"
    );
    expect(out).toContain('id="file-direct"');
    expect(out).toContain('title="Notes.txt"');
    expect(out).toContain(
      `Use: read with \`${CAT_TOOL}\`; semantic search with \`${SEARCH_TOOL}\`.\npreview\n</attachment>`
    );
    expect(out).not.toContain("via the project context");
  });

  it("advertises only the tools registered in the current mode", () => {
    const attachments = [
      makeFileAttachment({
        fileId: "file-direct",
        title: "Notes.txt",
        isInProjectContext: false,
        snippet: "preview",
      }),
    ];

    const out = contentFromAttachments(attachments, {
      usage: attachmentUsageHintsFor({
        isNewFileExplorer: true,
        hasSandboxTools: true,
      }),
    });

    expect(out).toContain(`Use: read with \`${CAT_TOOL}\`.`);
    expect(out).not.toContain(SEARCH_TOOL);
  });

  it("lists project-context attachments under the project header", () => {
    const attachments = [
      makeFileAttachment({
        fileId: "file-proj",
        title: "Spec.md",
        isInProjectContext: true,
        snippet: null,
        isIncludable: false,
        isSearchable: false,
      }),
    ];

    const out = contentFromAttachments(attachments, { usage: LEGACY_USAGE });

    expect(out).toContain(
      "The following files are currently attached to the conversation via the pod context:"
    );
    expect(out).toContain('id="file-proj"');
    expect(out).toMatch(/<attachment[\s\S]*?\/>/);
    expect(out).not.toContain("</attachment>");
    expect(out).not.toContain("attached to the conversation directly");
  });

  it("places all direct attachments before all project-context attachments", () => {
    const attachments = [
      makeFileAttachment({
        fileId: "proj-first",
        title: "A",
        isInProjectContext: true,
      }),
      makeFileAttachment({
        fileId: "direct-mid",
        title: "B",
        isInProjectContext: false,
      }),
      makeFileAttachment({
        fileId: "proj-last",
        title: "C",
        isInProjectContext: true,
      }),
    ];

    const out = contentFromAttachments(attachments, { usage: LEGACY_USAGE });

    const idxDirectHeader = out.indexOf("conversation directly:");
    const idxProjectHeader = out.indexOf("via the pod context:");
    const idxDirectFile = out.indexOf('id="direct-mid"');
    const idxProjFirst = out.indexOf('id="proj-first"');
    const idxProjLast = out.indexOf('id="proj-last"');

    expect(idxDirectHeader).toBeLessThan(idxProjectHeader);
    expect(idxDirectHeader).toBeLessThan(idxDirectFile);
    expect(idxDirectFile).toBeLessThan(idxProjectHeader);
    expect(idxProjectHeader).toBeLessThan(idxProjFirst);
    expect(idxProjFirst).toBeLessThan(idxProjLast);
  });

  it("separates multiple attachments in the same section with a newline", () => {
    const attachments = [
      makeFileAttachment({
        fileId: "a",
        title: "A",
        isInProjectContext: false,
      }),
      makeFileAttachment({
        fileId: "b",
        title: "B",
        isInProjectContext: false,
      }),
    ];

    const out = contentFromAttachments(attachments, { usage: LEGACY_USAGE });

    expect(out).toContain("</attachment>\n<attachment");
  });

  it("uses snippetContent for every attachment when provided", () => {
    const attachments = [
      makeFileAttachment({
        fileId: "x",
        title: "X",
        isInProjectContext: false,
        snippet: "original snippet",
      }),
    ];

    const out = contentFromAttachments(attachments, {
      usage: LEGACY_USAGE,
      snippetContent: "Snippet content too large.",
    });

    expect(out).toContain("Snippet content too large.\n</attachment>");
    expect(out).not.toContain("original snippet");
  });
});
