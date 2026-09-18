import {
  getNavigateUpIndex,
  getVisibleNavigationEntries,
} from "@app/components/data_source_view/browser/useKnowledgeBrowserNavigation";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import {
  makeDataSourceViewFixture,
  makeSpaceFixture,
} from "@app/tests/utils/content_node_test_fixtures";
import { describe, expect, it } from "vitest";

const root: NavigationHistoryEntryType = { type: "root" };
const category: NavigationHistoryEntryType = {
  type: "category",
  category: "managed",
};
const view: NavigationHistoryEntryType = {
  type: "data_source",
  dataSourceView: makeDataSourceViewFixture("dsv1"),
  tagsFilter: null,
};
const regular: NavigationHistoryEntryType = {
  type: "space",
  space: makeSpaceFixture({ sId: "space1", name: "Series C" }),
};
const pod: NavigationHistoryEntryType = {
  type: "space",
  space: makeSpaceFixture({ sId: "pod1", name: "Launch", kind: "project" }),
};

describe("getNavigateUpIndex", () => {
  it("goes up one level in a regular space", () => {
    expect(getNavigateUpIndex([root, regular, category, view])).toBe(2);
    expect(getNavigateUpIndex([root, regular, category])).toBe(1);
  });

  it("skips a pod's space level and lands on the root", () => {
    expect(getNavigateUpIndex([root, pod, category, view])).toBe(2);
    expect(getNavigateUpIndex([root, pod, category])).toBe(0);
  });

  it("stays at the root", () => {
    expect(getNavigateUpIndex([root])).toBe(0);
  });
});

describe("getVisibleNavigationEntries", () => {
  it("hides a pod's skipped category and keeps indexes", () => {
    expect(
      getVisibleNavigationEntries([root, pod, category, view]).map(
        ({ index }) => index
      )
    ).toEqual([0, 1, 3]);
    expect(
      getVisibleNavigationEntries([root, regular, category, view]).map(
        ({ index }) => index
      )
    ).toEqual([0, 1, 2, 3]);
  });
});
