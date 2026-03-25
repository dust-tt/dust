import type { FileAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { describe, expect, it } from "vitest";

import { contentFromAttachments } from "./index";

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
    ...partial,
  };
}

describe("contentFromAttachments", () => {
  it("returns an empty string when there are no attachments", () => {
    expect(contentFromAttachments([])).toBe("");
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

    const out = contentFromAttachments(attachments);

    expect(out).toContain(
      "The following files are currently attached to the conversation directly:"
    );
    expect(out).toContain('id="file-direct"');
    expect(out).toContain('title="Notes.txt"');
    expect(out).toContain(">preview\n</attachment>");
    expect(out).not.toContain("via the project context");
  });

  it("lists project-context attachments under the project header", () => {
    const attachments = [
      makeFileAttachment({
        fileId: "file-proj",
        title: "Spec.md",
        isInProjectContext: true,
        snippet: null,
      }),
    ];

    const out = contentFromAttachments(attachments);

    expect(out).toContain(
      "The following files are currently attached to the conversation via the project context:"
    );
    expect(out).toContain('id="file-proj"');
    expect(out).toContain('isInProjectContext="true"');
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

    const out = contentFromAttachments(attachments);

    const idxDirectHeader = out.indexOf("conversation directly:");
    const idxProjectHeader = out.indexOf("via the project context:");
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

    const out = contentFromAttachments(attachments);

    expect(out).toContain("/>\n<attachment");
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

    const out = contentFromAttachments(
      attachments,
      "Snippet content too large."
    );

    expect(out).toContain(">Snippet content too large.\n</attachment>");
    expect(out).not.toContain("original snippet");
  });
});
