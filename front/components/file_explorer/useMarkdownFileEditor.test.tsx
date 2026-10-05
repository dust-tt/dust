import { useMarkdownFileEditor } from "@app/components/file_explorer/useMarkdownFileEditor";
import { putFileContentByPath } from "@app/lib/swr/files";
import { Err, Ok } from "@app/types/shared/result";
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

vi.mock("@app/lib/swr/files", () => ({
  writeFileContentByPath: vi.fn(),
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
  exceedsWriteLimit: false,
  owner,
  rawContent: "# Notes\n",
  revision: "1",
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
    vi.mocked(putFileContentByPath).mockReset();
    vi.mocked(putFileContentByPath).mockResolvedValue(
      new Ok({ revision: "2" })
    );
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
          finishWrite = () => resolve(new Ok({ revision: "2" }));
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
          finishWrite = () => resolve(new Ok({ revision: "2" }));
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

  it("keeps the plain editor when the file exceeds the write limit", () => {
    flags.add("co_edition");

    const { result } = renderHook(() =>
      useMarkdownFileEditor({ ...params, exceedsWriteLimit: true })
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
          finishWrite = () => resolve(new Ok({ revision: "2" }));
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

    rerender({ ...revised, exceedsWriteLimit: true });

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

    rerender({ ...revised, exceedsWriteLimit: true });

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

  it("saves against the revision the editor opened on and adopts the stored one", async () => {
    flags.add("co_edition");
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );

    await act(async () => {
      await result.current.richEditor?.onSave("# Notes, mine\n");
    });

    expect(vi.mocked(putFileContentByPath)).toHaveBeenCalledWith(
      expect.objectContaining({ content: "# Notes, mine\n", revision: "1" })
    );
    rerender({ ...params, rawContent: "# Notes, mine\n", revision: "2" });
    await act(async () => {
      await result.current.richEditor?.onSave("# Notes, more\n");
    });
    expect(vi.mocked(putFileContentByPath)).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "# Notes, more\n", revision: "2" })
    );
  });

  it("saves a plain draft without a revision when co_edition is off", async () => {
    const { result } = renderHook(() => useMarkdownFileEditor(params));
    act(() => {
      result.current.setDraft("# Notes\n\nMine");
    });
    await act(async () => {
      await result.current.save();
    });

    expect(vi.mocked(putFileContentByPath)).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "# Notes\n\nMine", revision: null })
    );
  });

  // With co_edition on, the plain editor still opens files above the write limit.
  it("saves a plain draft against the revision it was loaded from, not a later fetch", async () => {
    flags.add("co_edition");
    const large = { ...params, exceedsWriteLimit: true };
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: large }
    );
    act(() => {
      result.current.setDraft("# Notes\n\nMine");
    });

    // Someone else wrote revision 2 while the draft was dirty.
    rerender({ ...revised, exceedsWriteLimit: true, revision: "2" });
    await act(async () => {
      await result.current.save();
    });

    expect(vi.mocked(putFileContentByPath)).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "# Notes\n\nMine", revision: "1" })
    );
  });

  it("adopts the stored revision even when the saved text did not change", async () => {
    flags.add("co_edition");
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );

    await act(async () => {
      await result.current.richEditor?.onSave("# Notes\n");
    });
    // The fetch echo brings the same text with the new revision.
    rerender({ ...params, revision: "2" });
    await act(async () => {
      await result.current.richEditor?.onSave("# Notes, more\n");
    });

    expect(vi.mocked(putFileContentByPath)).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "# Notes, more\n", revision: "2" })
    );
  });

  it("follows a revision that moved under the same text, in the plain editor", async () => {
    flags.add("co_edition");
    const large = { ...params, exceedsWriteLimit: true };
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: large }
    );

    // Someone else saved identical content as revision 2.
    rerender({ ...large, revision: "2" });
    act(() => {
      result.current.setDraft("# Notes\n\nMine");
    });
    await act(async () => {
      await result.current.save();
    });

    expect(vi.mocked(putFileContentByPath)).toHaveBeenLastCalledWith(
      expect.objectContaining({ revision: "2" })
    );
  });

  it("follows a revision that moved under the same text, in the rich editor", async () => {
    flags.add("co_edition");
    const { result, rerender } = renderHook(
      (props) => useMarkdownFileEditor(props),
      { initialProps: params }
    );

    rerender({ ...params, revision: "2" });
    await act(async () => {
      await result.current.richEditor?.onSave("# Notes, mine\n");
    });

    expect(vi.mocked(putFileContentByPath)).toHaveBeenLastCalledWith(
      expect.objectContaining({ revision: "2" })
    );
  });

  it("refuses to save when the server reports a newer revision", async () => {
    flags.add("co_edition");
    vi.mocked(putFileContentByPath).mockResolvedValueOnce(
      new Err({
        code: "conflict",
        message: "This file changed since it was loaded.",
      })
    );
    const { result } = renderHook(() => useMarkdownFileEditor(params));

    let saved:
      | Awaited<
          ReturnType<NonNullable<typeof result.current.richEditor>["onSave"]>
        >
      | undefined;
    await act(async () => {
      saved = await result.current.richEditor?.onSave("# Notes, mine\n");
    });

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
