import {
  buildCategoryItems,
  buildDataSourceViewItems,
  buildNodeItems,
  buildSpaceItems,
} from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import type { RichSpaceType } from "@app/types/api/spaces";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@app/types/data_source_view";
import type { EnrichedSpaceType } from "@app/types/space";
import { describe, expect, it } from "vitest";

function makeSpace(
  overrides: Partial<EnrichedSpaceType> & Pick<EnrichedSpaceType, "sId">
): EnrichedSpaceType {
  return {
    createdAt: 0,
    updatedAt: 0,
    kind: "regular",
    name: overrides.sId,
    groupIds: [],
    isRestricted: false,
    ...overrides,
  };
}

function makeDataSourceView(
  sId: string,
  overrides: Partial<DataSourceViewType["dataSource"]> = {}
): DataSourceViewType {
  return {
    category: "managed",
    createdAt: 0,
    dataSource: {
      id: 1,
      sId: `ds-${sId}`,
      createdAt: 0,
      name: sId,
      description: null,
      assistantDefaultSelected: false,
      dustAPIProjectId: "p1",
      dustAPIDataSourceId: "d1",
      connectorId: null,
      connectorProvider: null,
      ...overrides,
    },
    id: 1,
    kind: "default",
    parentsIn: null,
    sId,
    spaceId: "space1",
    updatedAt: 0,
  };
}

function makeNode(
  internalId: string,
  overrides: Partial<DataSourceViewContentNode> = {}
): DataSourceViewContentNode {
  return {
    childrenCount: 0,
    expandable: false,
    internalId,
    lastUpdatedAt: null,
    mimeType: "text/plain",
    parentInternalId: null,
    parentInternalIds: null,
    parentTitle: null,
    permission: "read",
    providerVisibility: null,
    sourceUrl: null,
    title: internalId,
    type: "document",
    dataSourceView: makeDataSourceView("dsv1"),
    ...overrides,
  };
}

const usage: RichSpaceType["categories"][string]["usage"] = {
  count: 0,
  agents: [],
  skills: [],
};

describe("buildSpaceItems", () => {
  it("groups pods apart and orders by kind, restriction, then name", () => {
    const items = buildSpaceItems([
      makeSpace({ sId: "pod-b", kind: "project", name: "B" }),
      makeSpace({ sId: "locked", isRestricted: true, name: "A" }),
      makeSpace({ sId: "open", name: "Z" }),
      makeSpace({ sId: "company", kind: "global", name: "Company Data" }),
      makeSpace({ sId: "pod-a", kind: "project", name: "A" }),
    ]);

    expect(items.map((item) => [item.id, item.group])).toEqual([
      ["company", "spaces"],
      ["open", "spaces"],
      ["locked", "spaces"],
      ["pod-a", "pods"],
      ["pod-b", "pods"],
    ]);
  });
});

describe("buildCategoryItems", () => {
  it("keeps only populated, enabled, browsable categories in canonical order", () => {
    const items = buildCategoryItems(
      {
        website: { usage, count: 2 },
        managed: { usage, count: 3 },
        folder: { usage, count: 0 },
        apps: { usage, count: 1 },
        actions: { usage, count: 1 },
      },
      () => true
    );

    expect(items.map((item) => item.category)).toEqual(["managed", "website"]);
  });

  it("drops categories whose feature flag is off", () => {
    const items = buildCategoryItems(
      { managed: { usage, count: 1 }, folder: { usage, count: 1 } },
      (flag) => flag === undefined
    );

    expect(items.map((item) => item.category)).toEqual(["managed", "folder"]);
  });
});

describe("buildDataSourceViewItems", () => {
  const remote = makeDataSourceView("snowflake", {
    connectorProvider: "snowflake",
    connectorId: "c1",
  });
  const folder = makeDataSourceView("folder");

  it("keeps only remote databases for the data_warehouse view", () => {
    const items = buildDataSourceViewItems([folder, remote], {
      viewType: "data_warehouse",
      isDark: false,
    });
    expect(items.map((item) => item.id)).toEqual(["snowflake"]);
  });

  it("keeps only non-remote databases for the table view", () => {
    const items = buildDataSourceViewItems([remote, folder], {
      viewType: "table",
      isDark: false,
    });
    expect(items.map((item) => item.id)).toEqual(["folder"]);
  });

  it("keeps every view otherwise, sorted by name", () => {
    const items = buildDataSourceViewItems([remote, folder], {
      viewType: "all",
      isDark: false,
    });
    expect(items.map((item) => item.id)).toEqual(["folder", "snowflake"]);
  });
});

describe("buildNodeItems", () => {
  it("keeps every node and reports expandability", () => {
    const items = buildNodeItems(
      [
        makeNode("doc"),
        makeNode("folder", { type: "folder", expandable: true }),
      ],
      { isTopLevelInView: true }
    );
    expect(items.map((item) => [item.id, item.expandable])).toEqual([
      ["doc", false],
      ["folder", true],
    ]);
  });
});
