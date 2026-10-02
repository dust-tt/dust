import { useMarkdownFileEditor } from "@app/components/file_explorer/useMarkdownFileEditor";
import type { LightWorkspaceType } from "@app/types/user";
import { act, renderHook } from "@testing-library/react";
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

  it("reopens a clean editor on content written by someone else", () => {
    flags.add("co_edition");
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );
    const firstKey = result.current.richEditor?.mountKey;

    rerender({
      ...params,
      processedContent: { text: "# Notes, revised", format: "markdown" },
    });

    expect(result.current.richEditor?.mountKey).not.toBe(firstKey);
    expect(result.current.richEditor?.initialContent).toBe("# Notes, revised");
  });

  it("keeps a dirty editor on its draft and refuses to save over the new content", async () => {
    flags.add("co_edition");
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );
    const firstKey = result.current.richEditor?.mountKey;
    act(() => {
      result.current.richEditor?.onStateChange({ dirty: true, saving: false });
    });

    rerender({
      ...params,
      processedContent: { text: "# Notes, revised", format: "markdown" },
    });

    expect(result.current.richEditor?.mountKey).toBe(firstKey);
    expect(result.current.richEditor?.initialContent).toBe("# Notes");
    expect(result.current.isDirty).toBe(true);
    const saved = await result.current.richEditor?.onSave("# Notes, mine");
    expect(saved).toEqual({
      ok: false,
      error: expect.stringContaining("changed while you were editing"),
    });
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
