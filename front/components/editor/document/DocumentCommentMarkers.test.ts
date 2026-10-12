import { stackMarkers } from "@app/components/editor/document/DocumentCommentMarkers";
import { describe, expect, it } from "vitest";

describe("stackMarkers", () => {
  it("keeps markers level with anchors far enough apart", () => {
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

  it("stacks markers of one line and pushes the next line's markers down", () => {
    expect(
      stackMarkers([
        { id: "a", center: 10 },
        { id: "b", center: 10 },
        { id: "c", center: 38 },
        { id: "d", center: 120 },
      ])
    ).toEqual([
      { id: "a", center: 10 },
      { id: "b", center: 38 },
      { id: "c", center: 66 },
      { id: "d", center: 120 },
    ]);
  });
});
