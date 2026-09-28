import type { KnowledgeBrowserItem } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import {
  getNavigateUpIndex,
  getVisibleNavigationEntries,
  navigateToKnowledgeBrowserItem,
  useKnowledgeBrowserShortcuts,
} from "@app/components/data_source_view/browser/useKnowledgeBrowserNavigation";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { getDataSourceViewRootNode } from "@app/lib/content_nodes";
import {
  makeContentNodeFixture,
  makeDataSourceViewFixture,
  makeSpaceFixture,
} from "@app/tests/utils/content_node_test_fixtures";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
const folder: NavigationHistoryEntryType = {
  type: "node",
  node: makeContentNodeFixture("folder1", { expandable: true }),
  tagsFilter: null,
};

describe("getNavigateUpIndex", () => {
  it("goes up one level in a regular space", () => {
    expect(getNavigateUpIndex([root, regular, category, view])).toBe(2);
    expect(getNavigateUpIndex([root, regular, category])).toBe(1);
  });

  it("skips a pod's category and space levels and lands on the root", () => {
    expect(getNavigateUpIndex([root, pod, category, view, folder])).toBe(3);
    expect(getNavigateUpIndex([root, pod, category, view])).toBe(0);
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

describe("navigateToKnowledgeBrowserItem", () => {
  const dataSourceView = makeDataSourceViewFixture("dsv1");
  const folderNode = makeContentNodeFixture("folder1", {
    dataSourceView,
    expandable: true,
  });
  const folderItem: KnowledgeBrowserItem = {
    kind: "node",
    id: "folder1",
    title: "Folder",
    icon: () => null,
    node: folderNode,
    expandable: true,
  };

  function makeNavigation(navigationHistory: NavigationHistoryEntryType[]) {
    const calls: string[] = [];
    return {
      calls,
      navigation: {
        navigationHistory,
        setSpaceEntry: vi.fn((space) => calls.push(`space:${space.sId}`)),
        setCategoryEntry: vi.fn((c) => calls.push(`category:${c}`)),
        setDataSourceViewEntry: vi.fn((dsv) => calls.push(`view:${dsv.sId}`)),
        addNodeEntry: vi.fn((node) => calls.push(`node:${node.internalId}`)),
      },
    };
  }

  it("appends a node entered from its view or a node level", () => {
    for (const history of [
      [root, regular, category, view],
      [root, regular, category, view, folder],
    ]) {
      const { calls, navigation } = makeNavigation(history);
      navigateToKnowledgeBrowserItem(folderItem, navigation);
      expect(calls).toEqual(["node:folder1"]);
    }
  });

  it("fills the view, and the category, when entered from above the view", () => {
    const fromCategory = makeNavigation([root, regular, category]);
    navigateToKnowledgeBrowserItem(folderItem, fromCategory.navigation);
    expect(fromCategory.calls).toEqual(["view:dsv1", "node:folder1"]);

    const fromSpace = makeNavigation([root, regular]);
    navigateToKnowledgeBrowserItem(folderItem, fromSpace.navigation);
    expect(fromSpace.calls).toEqual([
      "category:managed",
      "view:dsv1",
      "node:folder1",
    ]);
  });

  it("leaves the history alone from the root", () => {
    const { calls, navigation } = makeNavigation([root]);
    navigateToKnowledgeBrowserItem(folderItem, navigation);
    expect(calls).toEqual([]);
  });

  it("lands on the view for a view's root node", () => {
    const rootItem = {
      ...folderItem,
      node: getDataSourceViewRootNode(dataSourceView),
    };

    const fromSpace = makeNavigation([root, regular]);
    navigateToKnowledgeBrowserItem(rootItem, fromSpace.navigation);
    expect(fromSpace.calls).toEqual(["category:managed", "view:dsv1"]);

    const fromFolder = makeNavigation([root, regular, category, view, folder]);
    navigateToKnowledgeBrowserItem(rootItem, fromFolder.navigation);
    expect(fromFolder.calls).toEqual(["view:dsv1"]);

    const atView = makeNavigation([root, regular, category, view]);
    navigateToKnowledgeBrowserItem(rootItem, atView.navigation);
    expect(atView.calls).toEqual([]);
  });
});

describe("useKnowledgeBrowserShortcuts", () => {
  it("enters a lone space once, even when it is offered again later", () => {
    const spaceA = makeSpaceFixture({ sId: "a" });
    const spaceB = makeSpaceFixture({ sId: "b" });
    const setSpaceEntry = vi.fn();
    const navigation = {
      navigationHistory: [root],
      setSpaceEntry,
      setCategoryEntry: vi.fn(),
    };

    const { rerender } = renderHook(
      ({ spaces }) => useKnowledgeBrowserShortcuts({ navigation, spaces }),
      { initialProps: { spaces: [spaceA] } }
    );
    rerender({ spaces: [spaceA] });
    rerender({ spaces: [spaceB] });
    rerender({ spaces: [spaceA] });
    rerender({ spaces: [spaceA, spaceB] });

    expect(setSpaceEntry.mock.calls).toEqual([[spaceA], [spaceB]]);
  });

  it("enters a pod's managed category from its space level", () => {
    const setCategoryEntry = vi.fn();
    renderHook(() =>
      useKnowledgeBrowserShortcuts({
        navigation: {
          navigationHistory: [root, pod],
          setSpaceEntry: vi.fn(),
          setCategoryEntry,
        },
        spaces: [pod.space, regular.space],
      })
    );
    expect(setCategoryEntry).toHaveBeenCalledWith("managed");
  });
});
