import {
  collectSelectableNodesForSelectAll,
  getContentNodeParents,
  unselectVisibleNodesAndDescendants,
} from "@app/components/contentNodeTreeSelection";
import type {
  ContentNode,
  ContentNodeWithParent,
} from "@app/types/connectors/connectors_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

function makeNode(
  overrides: Partial<ContentNode> & Pick<ContentNode, "internalId" | "title">
): ContentNode {
  return {
    childrenCount: 0,
    expandable: false,
    lastUpdatedAt: null,
    mimeType: "application/vnd.dust.folder",
    parentInternalId: null,
    permission: "none",
    providerVisibility: null,
    sourceUrl: null,
    type: "folder",
    ...overrides,
  };
}

function getOkValue<T>(result: Result<T, Error>): T {
  expect(result.isOk()).toBe(true);
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

describe("collectSelectableNodesForSelectAll", () => {
  it("skips prevented nodes when no child fetcher is provided", async () => {
    const site = makeNode({
      internalId: "site",
      title: "Site",
      preventSelection: true,
      expandable: true,
    });
    const folder = makeNode({
      internalId: "folder",
      title: "Folder",
    });

    const selected = await collectSelectableNodesForSelectAll({
      nodes: [site, folder],
      parentIds: [],
    });

    expect(getOkValue(selected)).toEqual([{ node: folder, parents: [] }]);
  });

  it("selects selectable children of prevented containers", async () => {
    const site = makeNode({
      internalId: "site",
      title: "Site",
      preventSelection: true,
      expandable: true,
    });
    const drive = makeNode({
      internalId: "drive",
      title: "Documents",
      parentInternalId: "site",
    });
    const fetchChildResources = vi.fn(async () => new Ok([drive]));

    const selected = await collectSelectableNodesForSelectAll({
      nodes: [site],
      parentIds: [],
      fetchChildResources,
    });

    expect(fetchChildResources).toHaveBeenCalledWith("site");
    expect(getOkValue(selected)).toEqual([{ node: drive, parents: ["site"] }]);
  });

  it("recurses through nested prevented containers", async () => {
    const site = makeNode({
      internalId: "site",
      title: "Site",
      preventSelection: true,
      expandable: true,
    });
    const subSite = makeNode({
      internalId: "subsite",
      title: "Subsite",
      preventSelection: true,
      expandable: true,
      parentInternalId: "site",
    });
    const drive = makeNode({
      internalId: "drive",
      title: "Documents",
      parentInternalId: "subsite",
    });
    const fetchChildResources = vi.fn(async (parentId: string) => {
      if (parentId === "site") {
        return new Ok([subSite]);
      }
      if (parentId === "subsite") {
        return new Ok([drive]);
      }
      return new Ok([]);
    });

    const selected = await collectSelectableNodesForSelectAll({
      nodes: [site],
      parentIds: [],
      fetchChildResources,
    });

    expect(getOkValue(selected)).toEqual([
      { node: drive, parents: ["subsite", "site"] },
    ]);
  });

  it("limits child fetching concurrency across the full traversal", async () => {
    const sites = Array.from({ length: 8 }, (_, index) =>
      makeNode({
        internalId: `site-${index}`,
        title: `Site ${index}`,
        preventSelection: true,
        expandable: true,
      })
    );
    let activeFetches = 0;
    let maxActiveFetches = 0;
    const fetchChildResources = vi.fn(async (parentId: string) => {
      activeFetches += 1;
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeFetches -= 1;

      if (parentId.startsWith("site-") && !parentId.includes("subsite")) {
        return new Ok(
          Array.from({ length: 8 }, (_, index) =>
            makeNode({
              internalId: `${parentId}-subsite-${index}`,
              title: `Subsite ${index}`,
              preventSelection: true,
              expandable: true,
            })
          )
        );
      }
      return new Ok([
        makeNode({
          internalId: `${parentId}-drive`,
          title: "Documents",
        }),
      ]);
    });

    const selected = await collectSelectableNodesForSelectAll({
      nodes: sites,
      parentIds: [],
      fetchChildResources,
    });

    expect(getOkValue(selected)).toHaveLength(64);
    expect(maxActiveFetches).toBeLessThanOrEqual(8);
  });

  it("returns expected child-loading failures", async () => {
    const site = makeNode({
      internalId: "site",
      title: "Site",
      preventSelection: true,
      expandable: true,
    });
    const error = new Error("Could not load children");

    const selected = await collectSelectableNodesForSelectAll({
      nodes: [site],
      parentIds: [],
      fetchChildResources: async () => new Err(error),
    });

    expect(selected.isErr()).toBe(true);
    if (selected.isErr()) {
      expect(selected.error).toBe(error);
    }
  });
});

describe("getContentNodeParents", () => {
  it("prefers the complete ancestry over the immediate parent", () => {
    const folder: ContentNodeWithParent = {
      ...makeNode({
        internalId: "folder",
        title: "Folder",
        parentInternalId: "drive",
      }),
      parentInternalIds: ["drive", "site"],
      parentTitle: "Documents",
    };

    expect(getContentNodeParents(folder)).toEqual(["drive", "site"]);
  });
});

describe("unselectVisibleNodesAndDescendants", () => {
  it("unselects visible nodes and previously selected nested descendants", () => {
    const site = makeNode({
      internalId: "site",
      title: "Site",
      preventSelection: true,
      expandable: true,
    });
    const folder = makeNode({
      internalId: "folder",
      title: "Folder",
      parentInternalId: "drive",
    });

    const next = unselectVisibleNodesAndDescendants(
      {
        site: { isSelected: true, node: site, parents: [] },
        folder: {
          isSelected: true,
          node: folder,
          parents: ["drive", "site"],
        },
      },
      [site]
    );

    expect(next).toEqual({
      site: { isSelected: false, node: site, parents: [] },
      folder: { isSelected: false, node: folder, parents: [] },
    });
  });
});
