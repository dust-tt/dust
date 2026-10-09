import { stackMarkers } from "@app/components/editor/document/DocumentCommentMarkers";
import { describe, expect, it } from "vitest";

describe("stackMarkers", () => {
  it("keeps bubbles level with anchors far enough apart", () => {
    expect(
      stackMarkers([
        { id: "a", center: 10 },
        { id: "b", center: 100 },
      ])
    ).toEqual([
      { id: "a", center: 10 },
      { id: "b", center: 100 },
    ]);
  });

  it("stacks bubbles of anchors on one line, or too close, below one another", () => {
    expect(
      stackMarkers([
        { id: "a", center: 10 },
        { id: "b", center: 10 },
        { id: "c", center: 20 },
        { id: "d", center: 80 },
      ])
    ).toEqual([
      { id: "a", center: 10 },
      { id: "b", center: 38 },
      { id: "c", center: 66 },
      { id: "d", center: 94 },
    ]);
  });
});
