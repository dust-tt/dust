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

  it("edits a button label on click without firing the button handler", () => {
    const editText = vi.fn();
    const onButtonClick = vi.fn();
    const { container } = renderEditable(
      editText,
      <button type="button" onClick={onButtonClick}>
        <span data-editable data-raw-text={encodeURIComponent("Save")}>
          Save
        </span>
      </button>,
      { stagedEdits: true, editModeActive: true }
    );

    const button = container.querySelector("button") as HTMLButtonElement;
    // Stay enabled so the label can receive clicks; activation is blocked in capture.
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("data-frame-edit-label")).toBe(true);

    const span = container.querySelector("[data-editable]") as HTMLElement;
    fireEvent.click(span);

    expect(span.contentEditable).toBe("true");
    expect(onButtonClick).not.toHaveBeenCalled();
  });

  it("temporarily re-enables an already-disabled button so its label is clickable", () => {
    const editText = vi.fn();
    const onButtonClick = vi.fn();
    const { container } = renderEditable(
      editText,
      <button type="button" disabled onClick={onButtonClick}>
        <span data-editable data-raw-text={encodeURIComponent("Add todo")}>
          Add todo
        </span>
      </button>,
      { stagedEdits: true, editModeActive: true }
    );

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("data-frame-edit-was-disabled")).toBe(true);
    expect(button.hasAttribute("data-frame-edit-label")).toBe(true);

    const span = container.querySelector("[data-editable]") as HTMLElement;
    fireEvent.click(span);

    expect(span.contentEditable).toBe("true");
    expect(onButtonClick).not.toHaveBeenCalled();
  });

  it("keeps clearing disabled when React re-applies it during Edit", () => {
    const editText = vi.fn();
    const { container, rerender } = render(
      <VizContext.Provider
        value={{
          isPdfMode: false,
          editText,
          addEventListener: null,
          stagedEdits: true,
          editModeActive: true,
        }}
      >
        <EditableFrame>
          <button type="button" disabled={!"".trim()}>
            <span data-editable data-raw-text={encodeURIComponent("Add todo")}>
              Add todo
            </span>
          </button>
        </EditableFrame>
      </VizContext.Provider>
    );

    const button = () => container.querySelector("button") as HTMLButtonElement;
    expect(button().disabled).toBe(false);

    // Simulate the Frame re-render that sets disabled={!title.trim()} again.
    rerender(
      <VizContext.Provider
        value={{
          isPdfMode: false,
          editText,
          addEventListener: null,
          stagedEdits: true,
          editModeActive: true,
        }}
      >
        <EditableFrame>
          <button type="button" disabled={!"".trim()}>
            <span data-editable data-raw-text={encodeURIComponent("Add todo")}>
              Add todo
            </span>
          </button>
        </EditableFrame>
      </VizContext.Provider>
    );

    expect(button().disabled).toBe(false);
    fireEvent.click(container.querySelector("[data-editable]") as HTMLElement);
    expect(
      (container.querySelector("[data-editable]") as HTMLElement)
        .contentEditable
    ).toBe("true");
  });

  it("restores prior disabled state when leaving Edit mode", () => {
    const editText = vi.fn();
    const { container, rerender } = render(
      <VizContext.Provider
        value={{
          isPdfMode: false,
          editText,
          addEventListener: null,
          stagedEdits: true,
          editModeActive: true,
        }}
      >
        <EditableFrame>
          <button type="button" disabled>
            <span data-editable data-raw-text={encodeURIComponent("Off")}>
              Off
            </span>
          </button>
          <button type="button">Icon only</button>
        </EditableFrame>
      </VizContext.Provider>
    );

    const [labelButton, iconButton] = Array.from(
      container.querySelectorAll("button")
    );
    expect(labelButton.disabled).toBe(false);
    expect(labelButton.hasAttribute("data-frame-edit-was-disabled")).toBe(true);
    expect(labelButton.hasAttribute("data-frame-edit-label")).toBe(true);
    expect(iconButton.disabled).toBe(true);
    expect(iconButton.hasAttribute("data-frame-edit-disabled")).toBe(true);

    rerender(
      <VizContext.Provider
        value={{
          isPdfMode: false,
          editText,
          addEventListener: null,
          stagedEdits: true,
          editModeActive: false,
        }}
      >
        <EditableFrame>
          <button type="button" disabled>
            <span data-editable data-raw-text={encodeURIComponent("Off")}>
              Off
            </span>
          </button>
          <button type="button">Icon only</button>
        </EditableFrame>
      </VizContext.Provider>
    );

    const [restoredLabel, restoredIcon] = Array.from(
      container.querySelectorAll("button")
    );
    expect(restoredLabel.disabled).toBe(true);
    expect(restoredLabel.hasAttribute("data-frame-edit-label")).toBe(false);
    expect(restoredIcon.disabled).toBe(false);
    expect(restoredIcon.hasAttribute("data-frame-edit-disabled")).toBe(false);
  });

  it("still fires button handlers in Preview while staging is mounted", () => {
    const editText = vi.fn();
    const onButtonClick = vi.fn();
    const { container } = renderEditable(
      editText,
      <button type="button" onClick={onButtonClick}>
        <span data-editable data-raw-text={encodeURIComponent("Save")}>
          Save
        </span>
      </button>,
      { stagedEdits: true, editModeActive: false }
    );

    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onButtonClick).toHaveBeenCalledTimes(1);
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
