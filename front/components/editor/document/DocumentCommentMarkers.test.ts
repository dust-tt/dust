import { placeMarkers } from "@app/components/editor/document/DocumentCommentMarkers";
import { describe, expect, it } from "vitest";

describe("placeMarkers", () => {
  it("places one bubble per line, level with it", () => {
    expect(
      placeMarkers([
        { id: "a", center: 10 },
        { id: "b", center: 14 },
        { id: "c", center: 100 },
      ])
    ).toEqual([
      { ids: ["a", "b"], center: 10 },
      { ids: ["c"], center: 100 },
    ]);
  });

  it("moves a bubble below the previous one when lines are too close", () => {
    expect(
      placeMarkers([
        { id: "a", center: 10 },
        { id: "b", center: 25 },
        { id: "c", center: 40 },
      ])
    ).toEqual([
      { ids: ["a"], center: 10 },
      { ids: ["b"], center: 38 },
      { ids: ["c"], center: 66 },
    ]);
  });
});
