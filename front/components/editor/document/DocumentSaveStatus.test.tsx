import { DocumentStatusIcon } from "@app/components/editor/document/DocumentSaveStatus";
import type { CollabStatus } from "@app/components/editor/document/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const shownState = (status: CollabStatus, saveFailed: boolean) => {
  const { unmount } = render(
    <DocumentStatusIcon live={{ status, showSaving: true, saveFailed }} />
  );
  const state = screen.getByRole("status").getAttribute("data-state");
  unmount();
  return state;
};

describe("DocumentStatusIcon", () => {
  it("shows changes not saved while saves fail, over saving", () => {
    expect(shownState("live", true)).toBe("unsaved");
    expect(shownState("live", false)).toBe("saving");
  });

  it("shows a lost session as disconnected even while saves fail", () => {
    expect(shownState("offline", true)).toBe("disconnected");
  });
});
