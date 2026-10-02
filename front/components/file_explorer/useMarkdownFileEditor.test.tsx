import { useMarkdownFileEditor } from "@app/components/file_explorer/useMarkdownFileEditor";
import type { LightWorkspaceType } from "@app/types/user";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const flags = new Set<string>();

vi.mock("@app/lib/auth/AuthContext", () => ({
  useFeatureFlags: () => ({
    hasFeature: (flag: string) => flags.has(flag),
  }),
}));

vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => vi.fn(),
}));

const owner: LightWorkspaceType = {
  id: 1,
  sId: "w_1",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  locale: "en-US",
  metronomeCustomerId: null,
};

const params = {
  category: "markdown" as const,
  entryPath: "conversation-abc/notes.md",
  fileUrl: "/files/notes.md",
  isActive: true,
  isContentLoading: false,
  isTooLarge: false,
  isTruncated: false,
  owner,
  processedContent: { text: "# Notes", format: "markdown" as const },
};

describe("useMarkdownFileEditor", () => {
  beforeEach(() => {
    flags.clear();
  });

  it("keeps the plain editor when co_edition is off", () => {
    const { result } = renderHook(() => useMarkdownFileEditor(params));

    expect(result.current.richEditor).toBeNull();
    expect(result.current.canEdit).toBe(true);
  });

  it("opens the rich editor for an editable Markdown file when co_edition is on", () => {
    flags.add("co_edition");

    const { result } = renderHook(() => useMarkdownFileEditor(params));

    expect(result.current.richEditor?.initialContent).toBe("# Notes");
  });

  it("keeps the plain editor when the preview text was truncated", () => {
    flags.add("co_edition");

    const { result } = renderHook(() =>
      useMarkdownFileEditor({ ...params, isTruncated: true })
    );

    expect(result.current.richEditor).toBeNull();
  });

  it("does not let the file content decide which editor opens", () => {
    flags.add("co_edition");
    const unsupported = {
      ...params,
      processedContent: {
        text: "| a | b |\n|---|---|\n| 1 | 2 |",
        format: "markdown" as const,
      },
    };

    const { result } = renderHook(() => useMarkdownFileEditor(unsupported));

    expect(result.current.richEditor).not.toBeNull();
  });
});
