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
  addEventListener: ReturnType<typeof vi.fn> | null = null
) {
  return render(
    <VizContext.Provider
      value={{ isPdfMode: false, editText, addEventListener }}
    >
      <EditableFrame>{children}</EditableFrame>
    </VizContext.Provider>
  );
}

describe("EditableFrame", () => {
  it("enters edit mode on a single click", () => {
    const editText = vi.fn();
    const { container } = renderEditable(
      editText,
      <span data-editable data-raw-text={encodeURIComponent("Hello")}>
        Hello
      </span>
    );

    const span = container.querySelector("[data-editable]") as HTMLElement;
    fireEvent.click(span);

    expect(span.contentEditable).toBe("true");
    expect(span.dataset.originalText).toBe("Hello");
  });

  it("saves overlapping blurs instead of dropping the second edit", async () => {
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
      </>
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

  it("registers FLUSH_EDITABLES through the origin-validated listener", () => {
    const editText = vi.fn().mockResolvedValue({ success: true });
    const addEventListener = vi.fn(() => () => undefined);

    renderEditable(
      editText,
      <span data-editable data-raw-text={encodeURIComponent("Hello")}>
        Hello
      </span>,
      addEventListener
    );

    // Must not attach a raw window message listener; parent messages are filtered by origin
    // in VisualizationWrapper before this handler runs (allowed-visualization-origins).
    expect(addEventListener).toHaveBeenCalledWith(
      "FLUSH_EDITABLES",
      expect.any(Function)
    );
  });
});
