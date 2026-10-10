import type { DocumentSaveResult } from "@app/components/editor/document/types";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { Err, Ok } from "@app/types/shared/result";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function renderEditor(
  onSave: (content: string) => Promise<DocumentSaveResult>,
  initialContent = "# Title\n",
  { autosaveDebounceMs = 60_000, onRender = (): void => undefined } = {}
) {
  return renderHook(
    (props: { initialContent: string }) => {
      onRender();
      return useDocumentEditor({
        initialContent: props.initialContent,
        readOnly: false,
        autosaveDebounceMs,
        onSave,
        onStateChange: undefined,
        resolveImageSource: () => null,
      });
    },
    { initialProps: { initialContent } }
  );
}

async function mountedEditor(result: { current: { editor: Editor | null } }) {
  await waitFor(() => expect(result.current.editor).not.toBeNull());
  await act(nextTick);
  const editor = result.current.editor;
  if (!editor) {
    throw new Error("Editor did not mount.");
  }
  return editor;
}

describe("useDocumentEditor", () => {
  it("saves unsaved content once on unmount", async () => {
    const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
    const { result, unmount } = renderEditor(onSave);
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await act(nextTick);

    act(() => {
      result.current.editor?.commands.insertContent("Draft ");
    });
    expect(result.current.dirty).toBe(true);
    unmount();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toContain("Draft");
  });

  it("queues the unmount save behind the save in flight", async () => {
    let release: (result: DocumentSaveResult) => void = () => undefined;
    const inFlight = new Promise<DocumentSaveResult>((resolve) => {
      release = resolve;
    });
    const onSave = vi
      .fn()
      .mockReturnValueOnce(inFlight)
      .mockResolvedValue(new Ok(undefined));
    const { result, unmount } = renderEditor(onSave);
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await act(nextTick);

    act(() => {
      result.current.editor?.commands.insertContent("First ");
    });
    await act(async () => {
      void result.current.save();
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.editor?.commands.insertContent("Second ");
    });
    unmount();
    await nextTick();
    expect(onSave).toHaveBeenCalledTimes(1);

    release(new Ok(undefined));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1][0]).toContain("Second");
  });

  it("keeps the refused source and reason when the content prop changes", () => {
    const table = "| a | b |\n|---|---|\n| 1 | 2 |\n";
    const { result, rerender } = renderEditor(vi.fn(), table);
    const refused = result.current.unsupported;
    expect(refused?.source).toBe(table);

    rerender({ initialContent: "# Plain\n" });

    expect(result.current.unsupported).toEqual(refused);
  });

  it("does not save on unmount when nothing changed", async () => {
    const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
    const { result, unmount } = renderEditor(onSave);
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await act(nextTick);

    unmount();
    await nextTick();

    expect(onSave).not.toHaveBeenCalled();
  });

  describe("dirty tracking and autosave", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("is dirty after typing and clean once undone back to the saved content", async () => {
      const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
      const { result } = renderEditor(onSave);
      const editor = await mountedEditor(result);

      act(() => {
        editor.commands.insertContent("Draft ");
      });
      expect(result.current.dirty).toBe(true);

      act(() => {
        editor.commands.undo();
      });
      expect(result.current.dirty).toBe(false);
      await act(() => result.current.save());
      expect(onSave).not.toHaveBeenCalled();
    });

    it("clears a failed save's error without a request when undone back to the saved content", async () => {
      const onSave = vi.fn().mockResolvedValue(new Err("Offline."));
      const { result } = renderEditor(onSave);
      const editor = await mountedEditor(result);

      act(() => {
        editor.commands.insertContent("Draft ");
      });
      await act(() => result.current.save());
      expect(result.current.error).toBe("Offline.");
      expect(result.current.dirty).toBe(true);

      act(() => {
        editor.commands.undo();
      });
      expect(result.current.error).toBeNull();
      expect(result.current.dirty).toBe(false);
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("autosaves once, the idle delay after the last edit", async () => {
      const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
      const { result } = renderEditor(onSave, undefined, {
        autosaveDebounceMs: 3_000,
      });
      const editor = await mountedEditor(result);
      vi.useFakeTimers();

      act(() => {
        editor.commands.insertContent("One ");
      });
      act(() => vi.advanceTimersByTime(2_000));
      act(() => {
        editor.commands.insertContent("Two ");
      });
      act(() => vi.advanceTimersByTime(2_999));
      expect(onSave).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls[0][0]).toContain("One Two");
      expect(result.current.dirty).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("pauses autosave after a failed save until an explicit retry", async () => {
      const onSave = vi
        .fn()
        .mockResolvedValueOnce(new Err("Offline."))
        .mockResolvedValue(new Ok(undefined));
      const { result } = renderEditor(onSave, undefined, {
        autosaveDebounceMs: 3_000,
      });
      const editor = await mountedEditor(result);
      vi.useFakeTimers();

      act(() => {
        editor.commands.insertContent("Draft ");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(result.current.error).toBe("Offline.");

      act(() => {
        editor.commands.insertContent("More ");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(onSave).toHaveBeenCalledTimes(1);

      await act(() => result.current.save());
      expect(onSave).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBeNull();
      expect(result.current.dirty).toBe(false);
    });

    it("keeps an edit made during a save dirty, and autosaves it after", async () => {
      let release: (result: DocumentSaveResult) => void = () => undefined;
      const onSave = vi
        .fn()
        .mockReturnValueOnce(
          new Promise<DocumentSaveResult>((resolve) => {
            release = resolve;
          })
        )
        .mockResolvedValue(new Ok(undefined));
      const { result } = renderEditor(onSave, undefined, {
        autosaveDebounceMs: 3_000,
      });
      const editor = await mountedEditor(result);
      vi.useFakeTimers();

      act(() => {
        editor.commands.insertContent("First ");
      });
      let saved: Promise<void> = Promise.resolve();
      act(() => {
        saved = result.current.save();
      });
      act(() => {
        editor.commands.insertContent("Second ");
      });
      await act(async () => {
        release(new Ok(undefined));
        await saved;
      });
      expect(result.current.saving).toBe(false);
      expect(result.current.dirty).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(onSave).toHaveBeenCalledTimes(2);
      expect(onSave.mock.calls[1][0]).toContain("Second");
      expect(result.current.dirty).toBe(false);
    });

    it("re-renders only when dirty flips, and never reapplies the editor's options", async () => {
      let renders = 0;
      const { result, rerender } = renderEditor(
        vi.fn().mockResolvedValue(new Ok(undefined)),
        undefined,
        { onRender: () => renders++ }
      );
      const editor = await mountedEditor(result);
      const setOptions = vi.spyOn(editor, "setOptions");
      renders = 0;

      for (const text of ["a", "b", "c", "d"]) {
        act(() => {
          editor.commands.insertContent(text);
        });
      }
      expect(renders).toBe(1);

      rerender({ initialContent: "# Title\n" });
      await act(nextTick);
      expect(setOptions).not.toHaveBeenCalled();
    });
  });
});
