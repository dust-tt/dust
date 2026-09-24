// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { EditableFrame } from "@viz/app/components/EditableFrame";
import { VizContext } from "@viz/app/components/VizContext";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderEditable(
  editText: ReturnType<typeof vi.fn>,
  children: ReactNode,
  {
    addEventListener = null,
    stagedEdits = false,
    editModeActive = false,
  }: {
    addEventListener?: ReturnType<typeof vi.fn> | null;
    stagedEdits?: boolean;
    editModeActive?: boolean;
  } = {}
) {
  return render(
    <VizContext.Provider
      value={{
        isPdfMode: false,
        editText,
        addEventListener,
        stagedEdits,
        editModeActive,
      }}
    >
      <EditableFrame>{children}</EditableFrame>
    </VizContext.Provider>
  );
}

describe("EditableFrame", () => {
  it("enters edit mode on double-click when not staging (legacy)", () => {
    const editText = vi.fn();
    const { container } = renderEditable(
      editText,
      <span data-editable data-raw-text={encodeURIComponent("Hello")}>
        Hello
      </span>
    );

    const span = container.querySelector("[data-editable]") as HTMLElement;
    fireEvent.click(span);
    expect(span.contentEditable).not.toBe("true");

    fireEvent.doubleClick(span);
    expect(span.contentEditable).toBe("true");
    expect(span.dataset.originalText).toBe("Hello");
  });

  it("enters edit mode on a single click when staging (Frames v2 Edit)", () => {
    const editText = vi.fn();
    const { container } = renderEditable(
      editText,
      <span data-editable data-raw-text={encodeURIComponent("Hello")}>
        Hello
      </span>,
      { stagedEdits: true, editModeActive: true }
    );

    const span = container.querySelector("[data-editable]") as HTMLElement;
    fireEvent.click(span);

    expect(span.contentEditable).toBe("true");
    expect(span.dataset.originalText).toBe("Hello");
  });

  it("ignores clicks while staging is mounted but Edit mode is off (Preview)", () => {
    const editText = vi.fn();
    const { container } = renderEditable(
      editText,
      <span data-editable data-raw-text={encodeURIComponent("Hello")}>
        Hello
      </span>,
      { stagedEdits: true, editModeActive: false }
    );

    const span = container.querySelector("[data-editable]") as HTMLElement;
    fireEvent.click(span);
    expect(span.contentEditable).not.toBe("true");
  });

  it("saves overlapping blurs when staging instead of dropping the second edit", async () => {
    let resolveFirst: (value: { success: true }) => void = () => undefined;
    const editText = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ success: true }>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ success: true });

    const { container } = renderEditable(
      editText,
      <>
        <span
          data-editable
          data-raw-text={encodeURIComponent("One")}
          data-source="index.tsx:1:1"
        >
          One
        </span>
        <span
          data-editable
          data-raw-text={encodeURIComponent("Two")}
          data-source="index.tsx:2:1"
        >
          Two
        </span>
      </>,
      { stagedEdits: true, editModeActive: true }
    );

    const [first, second] = Array.from(
      container.querySelectorAll<HTMLElement>("[data-editable]")
    );

    fireEvent.click(first);
    first.textContent = "Uno";
    fireEvent.blur(first);

    fireEvent.click(second);
    second.textContent = "Dos";
    fireEvent.blur(second);

    await waitFor(() => expect(editText).toHaveBeenCalledTimes(2));

    resolveFirst({ success: true });

    await waitFor(() => {
      expect(editText).toHaveBeenNthCalledWith(1, {
        oldText: "One",
        newText: "Uno",
        source: "index.tsx:1:1",
      });
      expect(editText).toHaveBeenNthCalledWith(2, {
        oldText: "Two",
        newText: "Dos",
        source: "index.tsx:2:1",
      });
    });
  });

  it("registers FLUSH_EDITABLES only when staging", () => {
    const editText = vi.fn().mockResolvedValue({ success: true });
    const addEventListener = vi.fn(() => () => undefined);

    renderEditable(
      editText,
      <span data-editable data-raw-text={encodeURIComponent("Hello")}>
        Hello
      </span>,
      { addEventListener, stagedEdits: true, editModeActive: true }
    );

    expect(addEventListener).toHaveBeenCalledWith(
      "FLUSH_EDITABLES",
      expect.any(Function)
    );
  });

  it("does not register FLUSH_EDITABLES for legacy immediate edits", () => {
    const editText = vi.fn().mockResolvedValue({ success: true });
    const addEventListener = vi.fn(() => () => undefined);

    renderEditable(
      editText,
      <span data-editable data-raw-text={encodeURIComponent("Hello")}>
        Hello
      </span>,
      { addEventListener, stagedEdits: false }
    );

    expect(addEventListener).not.toHaveBeenCalled();
  });
});
