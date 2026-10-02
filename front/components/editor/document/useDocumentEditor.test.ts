import type { DocumentSaveResult } from "@app/components/editor/document/types";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { Ok } from "@app/types/shared/result";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function renderEditor(
  onSave: (content: string) => Promise<DocumentSaveResult>,
  content = "# Title\n"
) {
  return renderHook(
    (props: { content: string }) =>
      useDocumentEditor({
        content: props.content,
        readOnly: false,
        autosaveDebounceMs: 60_000,
        externalChangeAnimationMs: 0,
        onSave,
        onStateChange: undefined,
      }),
    { initialProps: { content } }
  );
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

  it("does not save on unmount when nothing changed", async () => {
    const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
    const { result, unmount } = renderEditor(onSave);
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await act(nextTick);

    unmount();
    await nextTick();

    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("useDocumentEditor with external changes", () => {
  it("adopts a new source in place when the editor is clean, without saving", async () => {
    const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
    const { result, rerender } = renderEditor(onSave);
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await act(nextTick);

    rerender({ content: "# Title\n\nWritten elsewhere.\n" });
    await waitFor(() =>
      expect(result.current.editor?.getText()).toContain("Written elsewhere.")
    );

    expect(result.current.dirty).toBe(false);
    expect(result.current.editor?.isEditable).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("ignores a new source while a draft is open", async () => {
    const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
    const { result, rerender } = renderEditor(onSave);
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await act(nextTick);
    act(() => {
      result.current.editor?.commands.insertContent("Mine ");
    });

    rerender({ content: "# Title\n\nWritten elsewhere.\n" });
    await act(nextTick);

    expect(result.current.editor?.getText()).not.toContain(
      "Written elsewhere."
    );
    expect(result.current.dirty).toBe(true);
  });

  it("reports a new source the editor cannot open instead of adopting it", async () => {
    const onSave = vi.fn().mockResolvedValue(new Ok(undefined));
    const { result, rerender } = renderEditor(onSave);
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await act(nextTick);

    rerender({ content: "| a | b |\n|---|---|\n| 1 | 2 |\n" });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.editor?.getText()).toContain("Title");
  });
});
