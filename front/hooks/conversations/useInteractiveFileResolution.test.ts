import {
  findInteractiveAttachmentByName,
  findInteractiveAttachmentByPath,
  findInteractiveGeneratedFile,
  hasInteractiveContentExtension,
} from "@app/hooks/conversations/useInteractiveFileResolution";
import { makeFileAttachment } from "@app/lib/api/assistant/conversation/attachments";
import type { LightAgentMessageType } from "@app/types/assistant/conversation";
import { frameContentType } from "@app/types/files";
import { describe, expect, it } from "vitest";

type GeneratedFile = LightAgentMessageType["generatedFiles"][number];

function makeGeneratedFrame({
  fileId,
  title,
  updatedAt,
}: {
  fileId: string;
  title: string;
  updatedAt?: number;
}): GeneratedFile {
  return {
    contentType: frameContentType,
    fileId,
    title,
    updatedAt,
  };
}

function makeInteractiveAttachment({
  fileId,
  title,
  path = null,
  updatedAt,
}: {
  fileId: string;
  title: string;
  path?: string | null;
  updatedAt?: number;
}) {
  return makeFileAttachment({
    contentType: frameContentType,
    fileId,
    hideFromUser: false,
    isInProjectContext: false,
    path,
    snippet: null,
    source: "agent",
    title,
    updatedAt,
  });
}

describe("hasInteractiveContentExtension", () => {
  it("matches frame-capable extensions case-insensitively", () => {
    expect(hasInteractiveContentExtension("HappyTuesday.tsx")).toBe(true);
    expect(hasInteractiveContentExtension("chart.JSX")).toBe(true);
    expect(hasInteractiveContentExtension("report.pdf")).toBe(false);
    expect(hasInteractiveContentExtension("data.csv")).toBe(false);
  });
});

describe("findInteractiveGeneratedFile", () => {
  it("matches an interactive file by title", () => {
    const files = [
      makeGeneratedFrame({ fileId: "fil_1", title: "Other.tsx" }),
      makeGeneratedFrame({ fileId: "fil_2", title: "HappyTuesday.tsx" }),
    ];

    expect(findInteractiveGeneratedFile(files, "HappyTuesday.tsx")).toEqual({
      contentType: frameContentType,
      fileId: "fil_2",
    });
  });

  it("ignores non-interactive files with the same title", () => {
    const files: GeneratedFile[] = [
      {
        contentType: "text/csv",
        fileId: "fil_1",
        title: "HappyTuesday.tsx",
      },
    ];

    expect(findInteractiveGeneratedFile(files, "HappyTuesday.tsx")).toBeNull();
  });

  it("prefers the most recently updated match", () => {
    const files = [
      makeGeneratedFrame({
        fileId: "fil_old",
        title: "HappyTuesday.tsx",
        updatedAt: 1,
      }),
      makeGeneratedFrame({
        fileId: "fil_new",
        title: "HappyTuesday.tsx",
        updatedAt: 2,
      }),
    ];

    expect(
      findInteractiveGeneratedFile(files, "HappyTuesday.tsx")?.fileId
    ).toBe("fil_new");
  });
});

describe("findInteractiveAttachmentByPath", () => {
  it("matches only on the exact scoped path", () => {
    const attachments = [
      makeInteractiveAttachment({ fileId: "fil_name", title: "Frame.tsx" }),
      makeInteractiveAttachment({
        fileId: "fil_path",
        path: "conversation-c1/Frame.tsx",
        title: "Renamed.tsx",
      }),
    ];

    expect(
      findInteractiveAttachmentByPath(attachments, "conversation-c1/Frame.tsx")
        ?.fileId
    ).toBe("fil_path");
    expect(
      findInteractiveAttachmentByPath(attachments, "conversation-c1/Other.tsx")
    ).toBeNull();
  });
});

describe("findInteractiveAttachmentByName", () => {
  it("matches an interactive attachment by title", () => {
    const attachments = [
      makeInteractiveAttachment({ fileId: "fil_1", title: "Frame.tsx" }),
    ];

    expect(
      findInteractiveAttachmentByName(attachments, "Frame.tsx")?.fileId
    ).toBe("fil_1");
  });

  it("returns null when only non-interactive attachments match", () => {
    const attachments = [
      makeFileAttachment({
        contentType: "text/csv",
        fileId: "fil_csv",
        hideFromUser: false,
        isInProjectContext: false,
        snippet: null,
        source: "agent",
        title: "Frame.tsx",
      }),
    ];

    expect(
      findInteractiveAttachmentByName(attachments, "Frame.tsx")
    ).toBeNull();
  });

  it("prefers the most recently updated match", () => {
    const attachments = [
      makeInteractiveAttachment({
        fileId: "fil_old",
        title: "Frame.tsx",
        updatedAt: 1,
      }),
      makeInteractiveAttachment({
        fileId: "fil_new",
        title: "Frame.tsx",
        updatedAt: 2,
      }),
    ];

    expect(
      findInteractiveAttachmentByName(attachments, "Frame.tsx")?.fileId
    ).toBe("fil_new");
  });
});
