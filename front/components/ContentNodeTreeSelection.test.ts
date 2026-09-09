import {
  collectSelectableNodesForSelectAll,
  unselectVisibleNodesAndDescendants,
} from "@app/components/ContentNodeTreeSelection";
import type { ContentNode } from "@app/types/connectors/connectors_api";
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

    expect(selected).toEqual([{ node: folder, parents: [] }]);
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
    const fetchChildResources = vi.fn(async () => [drive]);

    const selected = await collectSelectableNodesForSelectAll({
      nodes: [site],
      parentIds: [],
      fetchChildResources,
    });

    expect(fetchChildResources).toHaveBeenCalledWith("site");
    expect(selected).toEqual([{ node: drive, parents: ["site"] }]);
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
        return [subSite];
      }
      if (parentId === "subsite") {
        return [drive];
      }
      return [];
    });

    const selected = await collectSelectableNodesForSelectAll({
      nodes: [site],
      parentIds: [],
      fetchChildResources,
    });

    expect(selected).toEqual([{ node: drive, parents: ["subsite", "site"] }]);
  });
});

describe("unselectVisibleNodesAndDescendants", () => {
  it("unselects visible nodes and selected descendants", () => {
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

    const next = unselectVisibleNodesAndDescendants(
      {
        site: { isSelected: true, node: site, parents: [] },
        drive: { isSelected: true, node: drive, parents: ["site"] },
      },
      [site]
    );

    expect(next).toEqual({
      site: { isSelected: false, node: site, parents: [] },
      drive: { isSelected: false, node: drive, parents: [] },
    });
  });
});
