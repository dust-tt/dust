import { describe, expect, it } from "vitest";

import { getConfluenceContentParentIds } from "./hierarchy";

describe("getConfluenceContentParentIds", () => {
  it("returns the full parent chain up to the space", async () => {
    const parents = await getConfluenceContentParentIds(
      1,
      {
        id: "3",
        spaceId: "space",
        type: "page",
        parentId: "2",
        parentType: "folder",
      },
      {
        "3": { parentId: "2", parentType: "folder" },
        "2": { parentId: "1", parentType: "page" },
        "1": { parentId: null, parentType: null },
      }
    );

    expect(parents).toEqual([
      "confluence-page-3",
      "confluence-folder-2",
      "confluence-page-1",
      "confluence-space-space",
    ]);
  });

  it("terminates on a cyclic hierarchy without repeating ids", async () => {
    const parents = await getConfluenceContentParentIds(
      1,
      {
        id: "3",
        spaceId: "space",
        type: "page",
        parentId: "2",
        parentType: "page",
      },
      {
        "3": { parentId: "2", parentType: "page" },
        "2": { parentId: "1", parentType: "page" },
        "1": { parentId: "2", parentType: "page" },
      }
    );

    expect(parents).toEqual([
      "confluence-page-3",
      "confluence-page-2",
      "confluence-page-1",
      "confluence-space-space",
    ]);
  });

  it("terminates on a self-referencing content", async () => {
    const parents = await getConfluenceContentParentIds(
      1,
      {
        id: "1",
        spaceId: "space",
        type: "page",
        parentId: "1",
        parentType: "page",
      },
      { "1": { parentId: "1", parentType: "page" } }
    );

    expect(parents).toEqual(["confluence-page-1", "confluence-space-space"]);
  });
});
