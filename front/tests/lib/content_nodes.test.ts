import { describe, expect, it } from "vitest";

import {
  getDisplayTitleForContentNode,
  getDisplayTitleForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import type { DataSourceViewContentNode } from "@app/types";

function makeMicrosoftRootFolderNode(
  overrides: Partial<DataSourceViewContentNode> = {}
): DataSourceViewContentNode {
  return {
    childrenCount: 0,
    expandable: true,
    internalId: "node-1",
    lastUpdatedAt: null,
    mimeType: "application/vnd.dust.folder",
    parentInternalId: null,
    permission: "read",
    providerVisibility: null,
    sourceUrl:
      "https://tenant.sharepoint.com/sites/Project%20Alpha/Shared%20Documents/01%20Engagement",
    title: "01 Engagement",
    type: "folder",
    parentInternalIds: null,
    parentTitle: null,
    dataSourceView: {
      category: "folder",
      createdAt: 0,
      dataSource: {
        id: 1,
        sId: "ds_1",
        createdAt: 0,
        name: "Microsoft",
        description: null,
        assistantDefaultSelected: false,
        dustAPIProjectId: "p",
        dustAPIDataSourceId: "d",
        connectorId: "c",
        connectorProvider: "microsoft",
        editedByUser: null,
      },
      editedByUser: null,
      id: 1,
      kind: "default",
      parentsIn: null,
      sId: "dsv_1",
      spaceId: "space_1",
      updatedAt: 0,
    },
    ...overrides,
  };
}

describe("SharePoint folder display titles", () => {
  it("prefixes Microsoft SharePoint root folders with site name", () => {
    const node = makeMicrosoftRootFolderNode();
    expect(getDisplayTitleForDataSourceViewContentNode(node)).toBe(
      "Project Alpha → 01 Engagement"
    );
  });

  it("supports SharePoint share links with /:f:/r/sites/...", () => {
    const node = makeMicrosoftRootFolderNode({
      sourceUrl:
        "https://tenant.sharepoint.com/:f:/r/sites/Customer%20X/Shared%20Documents/02%20Work%20Plans?csf=1&web=1",
      title: "02 Work Plans",
    });
    expect(getDisplayTitleForDataSourceViewContentNode(node)).toBe(
      "Customer X → 02 Work Plans"
    );
  });

  it("supports SharePoint /teams/... paths", () => {
    const node = makeMicrosoftRootFolderNode({
      sourceUrl:
        "https://tenant.sharepoint.com/teams/Team%20Blue/Shared%20Documents/01%20Engagement",
    });
    expect(getDisplayTitleForDataSourceViewContentNode(node)).toBe(
      "Team Blue → 01 Engagement"
    );
  });

  it("does not prefix non-root nodes", () => {
    const node = makeMicrosoftRootFolderNode({ parentInternalId: "parent" });
    expect(getDisplayTitleForDataSourceViewContentNode(node)).toBe(
      "01 Engagement"
    );
  });

  it("does not prefix when sourceUrl is missing", () => {
    const node = makeMicrosoftRootFolderNode({ sourceUrl: null });
    expect(getDisplayTitleForDataSourceViewContentNode(node)).toBe(
      "01 Engagement"
    );
  });

  it("works through getDisplayTitleForContentNode (tree usage)", () => {
    const node = makeMicrosoftRootFolderNode();
    expect(getDisplayTitleForContentNode(node)).toBe(
      "Project Alpha → 01 Engagement"
    );
  });
});
