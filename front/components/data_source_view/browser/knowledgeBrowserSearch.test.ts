import {
  getKnowledgeBrowserSearchScope,
  getSearchResultKey,
  toDataSourceViewContentNodes,
} from "@app/components/data_source_view/browser/knowledgeBrowserSearch";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import {
  makeContentNodeFixture,
  makeDataSourceViewFixture,
  makeSpaceFixture,
} from "@app/tests/utils/content_node_test_fixtures";
import { describe, expect, it } from "vitest";

const space = makeSpaceFixture({ sId: "space1", name: "Series C" });
const github = makeDataSourceViewFixture("dsv-github", {
  connectorProvider: "github",
  connectorId: "c1",
});
const notion = makeDataSourceViewFixture("dsv-notion", {
  connectorProvider: "notion",
  connectorId: "c2",
});
const folder = makeContentNodeFixture("onboarding", {
  type: "folder",
  expandable: true,
  dataSourceView: github,
});

const root: NavigationHistoryEntryType = { type: "root" };
const atSpace: NavigationHistoryEntryType = { type: "space", space };
const atCategory: NavigationHistoryEntryType = {
  type: "category",
  category: "managed",
};
const atView: NavigationHistoryEntryType = {
  type: "data_source",
  dataSourceView: github,
  tagsFilter: null,
};
const atFolder: NavigationHistoryEntryType = {
  type: "node",
  node: folder,
  tagsFilter: null,
};

describe("getKnowledgeBrowserSearchScope", () => {
  it("has no scope at the root", () => {
    expect(getKnowledgeBrowserSearchScope([root], [])).toBeNull();
  });

  it("scopes to the whole space at the space level", () => {
    expect(getKnowledgeBrowserSearchScope([root, atSpace], [])).toEqual({
      spaceId: "space1",
    });
  });

  it("scopes to the category's views at the category level", () => {
    expect(
      getKnowledgeBrowserSearchScope(
        [root, atSpace, atCategory],
        [github, notion]
      )
    ).toEqual({
      spaceId: "space1",
      dataSourceViewIds: ["dsv-github", "dsv-notion"],
    });
  });

  it("scopes to the browsed view and folder subtree below that", () => {
    expect(
      getKnowledgeBrowserSearchScope([root, atSpace, atCategory, atView], [])
    ).toEqual({ spaceId: "space1", dataSourceViewIds: ["dsv-github"] });
    expect(
      getKnowledgeBrowserSearchScope(
        [root, atSpace, atCategory, atView, atFolder],
        []
      )
    ).toEqual({
      spaceId: "space1",
      dataSourceViewIds: ["dsv-github"],
      parentId: "onboarding",
    });
  });
});

describe("toDataSourceViewContentNodes", () => {
  it("keeps the view in the searched space and drops nodes without one", () => {
    const otherSpaceView = { ...notion, spaceId: "space2" };
    const { dataSourceView: _ignored, ...doc } = makeContentNodeFixture("doc");
    const nodes = [
      {
        ...doc,
        dataSource: github.dataSource,
        dataSourceViews: [otherSpaceView, github],
      },
      {
        ...doc,
        internalId: "elsewhere",
        dataSource: notion.dataSource,
        dataSourceViews: [otherSpaceView],
      },
    ];

    const result = toDataSourceViewContentNodes(nodes, "space1");

    expect(
      result.map((node) => [node.internalId, node.dataSourceView.sId])
    ).toEqual([["doc", "dsv-github"]]);
    expect(getSearchResultKey(result[0])).toBe("ds-dsv-github:doc");
  });
});
