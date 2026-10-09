import type { DocumentSaveResult } from "@app/components/editor/document/types";
import { useDocumentEditor } from "@app/components/editor/document/useDocumentEditor";
import { Ok } from "@app/types/shared/result";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function renderEditor(
  onSave: (content: string) => Promise<DocumentSaveResult>,
  initialContent = "# Title\n"
) {
  return renderHook(
    (props: { initialContent: string }) =>
      useDocumentEditor({
        initialContent: props.initialContent,
        readOnly: false,
        autosaveDebounceMs: 60_000,
        onSave,
        onStateChange: undefined,
        resolveImageSource: () => null,
      }),
    { initialProps: { initialContent } }
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
});
