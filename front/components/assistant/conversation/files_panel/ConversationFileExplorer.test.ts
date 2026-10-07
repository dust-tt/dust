import { getDeletePrompt } from "@app/components/assistant/conversation/files_panel/ConversationFileExplorer";
import type { FileExplorerEntry } from "@app/components/file_explorer/types";
import { i18n } from "@app/lib/i18n/i18n";
import type { MessageDescriptor } from "@lingui/core";
import { describe, expect, it } from "vitest";

const FILE = {
  kind: "file",
  fileName: "notes.md",
  path: "conversation-c1/notes.md",
} as unknown as FileExplorerEntry;

const FOLDER = {
  kind: "folder",
  name: "Reports",
  path: "conversation-c1/Reports",
} as unknown as FileExplorerEntry;

const FRAME = {
  kind: "frame_package",
  fileName: "Sales",
  path: "conversation-c1/Sales/manifest.json",
} as unknown as FileExplorerEntry;

const NODE = {
  kind: "node",
  fileName: "Some data source node",
  path: "conversation-c1/node",
} as unknown as FileExplorerEntry;

const translate = (descriptor: MessageDescriptor | undefined) =>
  descriptor ? i18n._(descriptor) : undefined;

describe("getDeletePrompt", () => {
  // The explorer offers Delete on every entry kind it renders, so each one needs copy: a kind
  // that falls through returns null and the click silently does nothing.
  it("names the file being deleted", () => {
    expect(translate(getDeletePrompt(FILE)?.title)).toBe("Delete file?");
    expect(translate(getDeletePrompt(FILE)?.message)).toContain("notes.md");
  });

  it("warns that a folder takes its contents with it", () => {
    expect(translate(getDeletePrompt(FOLDER)?.title)).toBe("Delete folder?");
    expect(translate(getDeletePrompt(FOLDER)?.message)).toContain("Reports");
    expect(translate(getDeletePrompt(FOLDER)?.message)).toContain(
      "all its contents"
    );
  });

  it("spells out what a Frame takes with it", () => {
    expect(translate(getDeletePrompt(FRAME)?.title)).toBe("Delete Frame?");
    expect(translate(getDeletePrompt(FRAME)?.message)).toContain("Sales");
    expect(translate(getDeletePrompt(FRAME)?.message)).toContain("share links");
  });

  it("returns null for a kind that cannot be deleted", () => {
    expect(getDeletePrompt(NODE)).toBeNull();
  });
});
