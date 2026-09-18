import {
  buildCategoryItems,
  buildDataSourceViewItems,
  buildNodeItems,
  buildSpaceItems,
} from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import {
  makeDataSourceViewFixture as makeDataSourceView,
  makeContentNodeFixture as makeNode,
  makeSpaceFixture as makeSpace,
} from "@app/tests/utils/content_node_test_fixtures";
import type { RichSpaceType } from "@app/types/api/spaces";
import { describe, expect, it } from "vitest";

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
  const doc = makeNode("doc");
  const sheet = makeNode("sheet", { mimeType: "text/csv", type: "table" });
  const folder = makeNode("folder", { type: "folder", expandable: true });

  it("keeps every node and reports expandability", () => {
    const items = buildNodeItems([doc, sheet, folder], {
      isTopLevelInView: true,
    });
    expect(items.map((item) => [item.id, item.expandable])).toEqual([
      ["doc", false],
      ["sheet", false],
      ["folder", true],
    ]);
  });

  it("describes folders by item count and files by space and freshness", () => {
    const items = buildNodeItems(
      [
        makeNode("doc", { lastUpdatedAt: Date.now() - 6 * 24 * 3600 * 1000 }),
        makeNode("fresh"),
        makeNode("folder", {
          type: "folder",
          expandable: true,
          childrenCount: 5,
        }),
        makeNode("one", { type: "folder", expandable: true, childrenCount: 1 }),
        makeNode("empty", { type: "folder", expandable: true }),
      ],
      { isTopLevelInView: true, spaceName: "Series C" }
    );
    expect(items.map((item) => item.description)).toEqual([
      "Series C · Updated 6d ago",
      "Series C",
      "5 items",
      "1 item",
      undefined,
    ]);
  });

  it("drops non-remote database tables when asked", () => {
    const items = buildNodeItems([doc, sheet, folder], {
      isTopLevelInView: true,
      excludeNonRemoteDatabaseTables: true,
    });
    expect(items.map((item) => item.id)).toEqual(["doc", "folder"]);
  });
});
