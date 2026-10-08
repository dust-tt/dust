import { useMarkdownFileEditor } from "@app/components/file_explorer/useMarkdownFileEditor";
import { writeFileContentByPath } from "@app/lib/swr/files";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const flags = new Set<string>();
let collabUrl: string | undefined;

vi.mock("@app/lib/auth/AuthContext", () => ({
  useFeatureFlags: () => ({
    hasFeature: (flag: string) => flags.has(flag),
  }),
  useCollabUrl: () => collabUrl,
}));

vi.mock("@app/hooks/useNotification", () => ({
  useSendApiErrorNotification: () => vi.fn(),
  useSendNotification: () => vi.fn(),
}));

vi.mock("@app/lib/swr/files", () => ({
  writeFileContentByPath: vi.fn(),
}));

const owner = LightWorkspaceFactory.build({ sId: "w_1", role: "user" });

const params = {
  category: "markdown" as const,
  entryPath: "conversation-abc/notes.md",
  fileUrl: "/files/notes.md",
  isActive: true,
  isContentLoading: false,
  isTooLarge: false,
  isTruncated: false,
  canWrite: true,
  owner,
  rawContent: "# Notes\n",
  processedContent: { text: "# Notes", format: "markdown" as const },
};

const revised = {
  ...params,
  rawContent: "# Notes, revised\n",
  processedContent: { text: "# Notes, revised", format: "markdown" as const },
};

describe("useMarkdownFileEditor", () => {
  beforeEach(() => {
    flags.clear();
    collabUrl = undefined;
    vi.mocked(writeFileContentByPath).mockResolvedValue(new Ok(undefined));
  });

  it("opens no editor when the mount refuses writes", () => {
    flags.add("co_edition");

    const { result } = renderHook(() =>
      useMarkdownFileEditor({ ...params, canWrite: false })
    );

    expect(result.current.canEdit).toBe(false);
    expect(result.current.richEditor).toBeNull();
  });

  it("keeps the plain editor when co_edition is off", () => {
    const { result } = renderHook(() => useMarkdownFileEditor(params));

    expect(result.current.richEditor).toBeNull();
    expect(result.current.canEdit).toBe(true);
  });

  it("keeps what was typed in the plain editor while its save was pending", async () => {
    let finishWrite: () => void = () => undefined;
    vi.mocked(writeFileContentByPath).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishWrite = () => resolve(new Ok(undefined));
        })
    );
    const { result } = renderHook(() => useMarkdownFileEditor(params));
    act(() => {
      result.current.setDraft("# Notes\n\nFirst");
    });

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.save();
    });
    act(() => {
      result.current.setDraft("# Notes\n\nFirst, then more");
    });
    finishWrite();
    await act(async () => {
      await pending;
    });

    expect(result.current.content).toBe("# Notes\n\nFirst, then more");
    expect(result.current.isDirty).toBe(true);
  });

  it("keeps an undo back to the original text made while the save was pending", async () => {
    let finishWrite: () => void = () => undefined;
    vi.mocked(writeFileContentByPath).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishWrite = () => resolve(new Ok(undefined));
        })
    );
    const { result } = renderHook(() => useMarkdownFileEditor(params));
    act(() => {
      result.current.setDraft("# Notes\n\nFirst");
    });

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.save();
    });
    act(() => {
      result.current.setDraft("# Notes");
    });
    finishWrite();
    await act(async () => {
      await pending;
    });

    expect(result.current.content).toBe("# Notes");
    expect(result.current.isDirty).toBe(true);
  });

  it("opens the rich editor for an editable Markdown file when co_edition is on", () => {
    flags.add("co_edition");

    const { result } = renderHook(() => useMarkdownFileEditor(params));

    expect(result.current.richEditor?.initialContent).toBe("# Notes\n");
  });

  it("opens no editor for writing when the preview text was cut", () => {
    flags.add("co_edition");

    const { result } = renderHook(() =>
      useMarkdownFileEditor({ ...params, isTruncated: true })
    );

    expect(result.current.richEditor).toBeNull();
    expect(result.current.canEdit).toBe(false);
  });

  it("does not open the plain editor on cut preview text when co_edition is off", () => {
    const { result } = renderHook(() =>
      useMarkdownFileEditor({ ...params, isTruncated: true })
    );

    expect(result.current.canEdit).toBe(false);
  });

  it("keeps a dirty plain draft when the file grows past the cut, and refuses to save it", async () => {
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );
    act(() => {
      result.current.setDraft("# Notes\n\nMine");
    });

    rerender({ ...revised, isTruncated: true });
    expect(result.current.canEdit).toBe(true);
    expect(result.current.content).toBe("# Notes\n\nMine");

    const writes = vi.mocked(writeFileContentByPath).mock.calls.length;
    await act(async () => {
      await result.current.save();
    });
    expect(vi.mocked(writeFileContentByPath).mock.calls.length).toBe(writes);
  });

  it("reopens a clean editor on content written by someone else", () => {
    flags.add("co_edition");
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );
    const firstKey = result.current.richEditor?.mountKey;

    rerender(revised);

    expect(result.current.richEditor?.mountKey).not.toBe(firstKey);
    expect(result.current.richEditor?.initialContent).toBe(
      "# Notes, revised\n"
    );
  });

  it("keeps a live editor open when the file is fetched again, even cut", () => {
    flags.add("co_edition");
    collabUrl = "ws://localhost/api/collab";
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );
    const firstKey = result.current.richEditor?.mountKey;
    expect(result.current.richEditor?.liveUrl).toBe(collabUrl);

    rerender(revised);
    expect(result.current.richEditor?.mountKey).toBe(firstKey);

    rerender({ ...revised, isTruncated: true });
    expect(result.current.richEditor?.mountKey).toBe(firstKey);
  });

  it("keeps an open editor local when the collab URL arrives", () => {
    flags.add("co_edition");
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );
    act(() => {
      result.current.richEditor?.onStateChange({
        dirty: true,
        saving: false,
        error: null,
      });
    });

    collabUrl = "ws://localhost/api/collab";
    rerender(params);
    expect(result.current.richEditor?.liveUrl).toBeUndefined();
  });

  it("keeps an open live editor live when the collab URL goes away", () => {
    flags.add("co_edition");
    collabUrl = "ws://localhost/api/collab";
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );
    const firstKey = result.current.richEditor?.mountKey;

    collabUrl = undefined;
    rerender(revised);
    expect(result.current.richEditor?.liveUrl).toBe(
      "ws://localhost/api/collab"
    );
    expect(result.current.richEditor?.mountKey).toBe(firstKey);
  });

  it("lifts the conflict once the editor is clean and reopens on the new content", async () => {
    flags.add("co_edition");
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );
    act(() => {
      result.current.richEditor?.onStateChange({
        dirty: true,
        saving: false,
        error: null,
      });
    });
    rerender(revised);
    const refused = await result.current.richEditor?.onSave("# Notes, mine\n");
    expect(refused?.isErr()).toBe(true);

    // The user undoes the local edit: the editor reports clean and reopens on the new content.
    act(() => {
      result.current.richEditor?.onStateChange({
        dirty: false,
        saving: false,
        error: null,
      });
    });

    expect(result.current.richEditor?.initialContent).toBe(
      "# Notes, revised\n"
    );
    const saved = await result.current.richEditor?.onSave("# Notes, again\n");
    expect(saved?.isOk()).toBe(true);
  });

  it("lifts the conflict once its own racing save has landed", async () => {
    flags.add("co_edition");
    let finishWrite: () => void = () => undefined;
    vi.mocked(writeFileContentByPath).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishWrite = () => resolve(new Ok(undefined));
        })
    );
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );
    act(() => {
      result.current.richEditor?.onStateChange({
        dirty: true,
        saving: true,
        error: null,
      });
    });

    // Our save of "mine" is in flight when a foreign version arrives.
    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.richEditor?.onSave("# Notes, mine\n");
    });
    rerender(revised);
    finishWrite();
    await act(async () => {
      await pending;
    });
    // The cache catches up with our write and the editor reports clean.
    rerender({ ...params, rawContent: "# Notes, mine\n" });
    act(() => {
      result.current.richEditor?.onStateChange({
        dirty: false,
        saving: false,
        error: null,
      });
    });

    const saved = await result.current.richEditor?.onSave("# Notes, more\n");
    expect(saved?.isOk()).toBe(true);
  });

  it("keeps a dirty editor open when a foreign write grows the file past the limit", async () => {
    flags.add("co_edition");
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );
    act(() => {
      result.current.richEditor?.onStateChange({
        dirty: true,
        saving: false,
        error: null,
      });
    });

    rerender({ ...revised, isTruncated: true });

    expect(result.current.richEditor).not.toBeNull();
    const refused = await result.current.richEditor?.onSave("# Notes, mine\n");
    expect(refused?.isErr()).toBe(true);
  });

  it("hands a clean editor to the plain one when the file grows past the limit", () => {
    flags.add("co_edition");
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );

    rerender({ ...revised, isTruncated: true });

    expect(result.current.richEditor).toBeNull();
  });

  it("does not take its own save for a foreign change", async () => {
    flags.add("co_edition");
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );
    act(() => {
      result.current.richEditor?.onStateChange({
        dirty: true,
        saving: true,
        error: null,
      });
    });

    await act(async () => {
      await result.current.richEditor?.onSave("# Notes, mine\n");
    });
    rerender({ ...params, rawContent: "# Notes, mine\n" });
    act(() => {
      result.current.richEditor?.onStateChange({
        dirty: true,
        saving: false,
        error: null,
      });
    });

    const again = await result.current.richEditor?.onSave("# Notes, more\n");
    expect(again?.isOk()).toBe(true);
  });

  it("holds navigation while unsaved, and lifts it once a save has failed", () => {
    flags.add("co_edition");
    const { result } = renderHook(() => useMarkdownFileEditor(params));
    expect(result.current.holdsNavigation).toBe(false);

    act(() => {
      result.current.richEditor?.onStateChange({
        dirty: true,
        saving: false,
        error: null,
      });
    });
    expect(result.current.holdsNavigation).toBe(true);

    act(() => {
      result.current.richEditor?.onStateChange({
        dirty: true,
        saving: false,
        error: "Could not save.",
      });
    });
    expect(result.current.holdsNavigation).toBe(false);
  });

  it("keeps a dirty editor on its draft and refuses to save over the new content", async () => {
    flags.add("co_edition");
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );
    const firstKey = result.current.richEditor?.mountKey;
    act(() => {
      result.current.richEditor?.onStateChange({
        dirty: true,
        saving: false,
        error: null,
      });
    });

    rerender(revised);

    expect(result.current.richEditor?.mountKey).toBe(firstKey);
    expect(result.current.richEditor?.initialContent).toBe("# Notes\n");
    expect(result.current.isDirty).toBe(true);
    const saved = await result.current.richEditor?.onSave("# Notes, mine");
    expect(saved?.isErr() && saved.error).toContain(
      "changed while you were editing"
    );
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
