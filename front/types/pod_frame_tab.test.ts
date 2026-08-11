import { normalizeTabsOrder } from "@app/types/pod_frame_tab";
import { describe, expect, it } from "vitest";

describe("normalizeTabsOrder", () => {
  it("returns every system tab in canonical order when nothing is saved", () => {
    expect(normalizeTabsOrder([], [])).toEqual([
      "conversations",
      "tasks",
      "files",
      "databases",
      "connected_data",
    ]);
  });

  it("slots a system tab the saved order predates next to its canonical neighbor", () => {
    // A pod saved before Databases existed: it must land after Files, not past the frame tabs.
    expect(
      normalizeTabsOrder(
        ["conversations", "tasks", "files", "connected_data", "dash.html"],
        ["dash.html"]
      )
    ).toEqual([
      "conversations",
      "tasks",
      "files",
      "databases",
      "connected_data",
      "dash.html",
    ]);
  });

  it("keeps the user's own ordering of the tabs they did save", () => {
    expect(
      normalizeTabsOrder(
        ["dash.html", "files", "conversations", "tasks", "connected_data"],
        ["dash.html"]
      )
    ).toEqual([
      "dash.html",
      "files",
      "databases",
      "conversations",
      "tasks",
      "connected_data",
    ]);
  });

  it("keeps a run of newly added tabs in canonical order before the frame tabs", () => {
    // Files, Databases and Connected Data are all missing: each anchors on the previous one, so
    // they arrive in canonical order and none is stranded past the frame tab.
    expect(
      normalizeTabsOrder(["conversations", "tasks", "dash.html"], ["dash.html"])
    ).toEqual([
      "conversations",
      "tasks",
      "files",
      "databases",
      "connected_data",
      "dash.html",
    ]);
  });

  it("puts a run of missing tabs in canonical order at the front", () => {
    expect(normalizeTabsOrder(["connected_data"], [])).toEqual([
      "conversations",
      "tasks",
      "files",
      "databases",
      "connected_data",
    ]);
  });

  it("appends frame paths that are missing and drops unknown entries", () => {
    // Files was moved to the front, so its canonical successors follow it there.
    expect(
      normalizeTabsOrder(
        ["files", "gone.html", "conversations"],
        ["dash.html", "other.html"]
      )
    ).toEqual([
      "files",
      "databases",
      "connected_data",
      "conversations",
      "tasks",
      "dash.html",
      "other.html",
    ]);
  });

  it("drops duplicates, keeping the first occurrence", () => {
    expect(normalizeTabsOrder(["files", "files", "conversations"], [])).toEqual(
      ["files", "databases", "connected_data", "conversations", "tasks"]
    );
  });
});
