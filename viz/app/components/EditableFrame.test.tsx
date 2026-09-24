// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { EditableFrame } from "@viz/app/components/EditableFrame";
import { VizContext } from "@viz/app/components/VizContext";
import type { EditTextFn } from "@viz/app/lib/visualization-api";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type AddEventListener = NonNullable<
  React.ContextType<typeof VizContext>["addEventListener"]
>;

interface RenderOptions {
  editText?: EditTextFn;
  addEventListener?: AddEventListener | null;
  stagedEdits?: boolean;
  editModeActive?: boolean;
}

function frame(
  children: ReactNode,
  {
    editText = vi.fn<EditTextFn>(),
    addEventListener = null,
    stagedEdits = false,
    editModeActive = false,
  }: RenderOptions = {}
) {
  return (
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

const hello = (
  <span data-editable data-raw-text={encodeURIComponent("Hello")}>
    Hello
  </span>
);

describe("EditableFrame", () => {
  it("enters edit mode on double-click for legacy Frames", () => {
    const { container } = render(frame(hello));

    const span = container.querySelector("[data-editable]") as HTMLElement;
    fireEvent.click(span);
    expect(span.contentEditable).not.toBe("true");

    fireEvent.doubleClick(span);
    expect(span.contentEditable).toBe("true");
    expect(span.dataset.originalText).toBe("Hello");
  });

  it("enters edit mode on a single click in a Frames v2 Edit session", () => {
    const { container } = render(
      frame(hello, { stagedEdits: true, editModeActive: true })
    );

    const span = container.querySelector("[data-editable]") as HTMLElement;
    fireEvent.click(span);

    expect(span.contentEditable).toBe("true");
  });

  it("ignores clicks in Frames v2 Preview", () => {
    const { container } = render(
      frame(hello, { stagedEdits: true, editModeActive: false })
    );

    const span = container.querySelector("[data-editable]") as HTMLElement;
    fireEvent.click(span);
    expect(span.contentEditable).not.toBe("true");
  });

  it("disables the Frame's form controls only during an Edit session", () => {
    const button = <button type="button">Add</button>;
    const { container, rerender } = render(
      frame(button, { stagedEdits: true, editModeActive: true })
    );

    const fieldset = () => container.querySelector("fieldset") as HTMLElement;
    const control = () => container.querySelector("button") as HTMLElement;
    expect(fieldset()).toHaveProperty("disabled", true);
    expect(control().matches(":disabled")).toBe(true);

    rerender(frame(button, { stagedEdits: true, editModeActive: false }));

    expect(fieldset()).toHaveProperty("disabled", false);
    expect(control().matches(":disabled")).toBe(false);
  });

  it("keeps legacy Frame controls enabled", () => {
    const { container } = render(frame(<button type="button">Add</button>));

    expect(
      (container.querySelector("button") as HTMLElement).matches(":disabled")
    ).toBe(false);
  });

  it("stages overlapping blurs instead of dropping the second edit", async () => {
    let resolveFirst: (value: { success: true }) => void = () => undefined;
    const editText = vi
      .fn<EditTextFn>()
      .mockImplementationOnce(
        () =>
          new Promise<{ success: true }>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ success: true });

    const { container } = render(
      frame(
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
        { editText, stagedEdits: true, editModeActive: true }
      )
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
    const staged = vi.fn<AddEventListener>(() => () => undefined);
    render(frame(hello, { addEventListener: staged, stagedEdits: true }));
    expect(staged).toHaveBeenCalledWith(
      "FLUSH_EDITABLES",
      expect.any(Function)
    );

    const legacy = vi.fn<AddEventListener>(() => () => undefined);
    render(frame(hello, { addEventListener: legacy }));
    expect(legacy).not.toHaveBeenCalled();
  });
});
