import { getDeletePrompt } from "@app/components/assistant/conversation/files_panel/ConversationFileExplorer";
import type { FileExplorerEntry } from "@app/components/file_explorer/types";
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

describe("getDeletePrompt", () => {
  // The explorer offers Delete on every entry kind it renders, so each one needs copy: a kind
  // that falls through returns null and the click silently does nothing.
  it("names the file being deleted", () => {
    expect(getDeletePrompt(FILE)).toMatchObject({ title: "Delete file?" });
    expect(getDeletePrompt(FILE)?.message).toContain("notes.md");
  });

  it("warns that a folder takes its contents with it", () => {
    expect(getDeletePrompt(FOLDER)).toMatchObject({ title: "Delete folder?" });
    expect(getDeletePrompt(FOLDER)?.message).toContain("Reports");
    expect(getDeletePrompt(FOLDER)?.message).toContain("all its contents");
  });

  it("spells out what a Frame takes with it", () => {
    expect(getDeletePrompt(FRAME)).toMatchObject({ title: "Delete Frame?" });
    expect(getDeletePrompt(FRAME)?.message).toContain("Sales");
    expect(getDeletePrompt(FRAME)?.message).toContain("share links");
  });

  it("returns null for a kind that cannot be deleted", () => {
    expect(getDeletePrompt(NODE)).toBeNull();
  });
});
