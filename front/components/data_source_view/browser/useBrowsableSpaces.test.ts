import { filterBrowsableSpaces } from "@app/components/data_source_view/browser/useBrowsableSpaces";
import { makeSpaceFixture } from "@app/tests/utils/content_node_test_fixtures";
import { describe, expect, it } from "vitest";

describe("filterBrowsableSpaces", () => {
  it("keeps only spaces holding a data source view, in the given order", () => {
    const spaces = [
      makeSpaceFixture({ sId: "empty", name: "Empty" }),
      makeSpaceFixture({ sId: "docs", name: "Docs" }),
      makeSpaceFixture({ sId: "pod", name: "Launch", kind: "project" }),
    ];
    const dataSourceViews = [
      { spaceId: "pod" },
      { spaceId: "docs" },
      { spaceId: "docs" },
    ];

    expect(
      filterBrowsableSpaces(spaces, dataSourceViews).map((s) => s.sId)
    ).toEqual(["docs", "pod"]);
  });

  it("returns nothing when no space holds a view", () => {
    expect(
      filterBrowsableSpaces([makeSpaceFixture({ sId: "empty" })], [])
    ).toEqual([]);
  });
});
