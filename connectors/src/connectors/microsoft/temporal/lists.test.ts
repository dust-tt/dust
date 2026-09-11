import { isSyncableList } from "@connectors/connectors/microsoft/lib/graph_api";
import {
  isLookupLikeColumn,
  isTableColumn,
  listItemsToRows,
} from "@connectors/connectors/microsoft/temporal/lists";
import type {
  ColumnDefinition,
  FieldValueSet,
  List,
  ListItem,
} from "@microsoft/microsoft-graph-types";
import { describe, expect, it } from "vitest";

// Graph types model list-item `fields` only as `Entity`, so fixtures go through
// a factory whose open-fields type keeps the item structurally checked (no cast).
type OpenFields = FieldValueSet & Record<string, unknown>;
function makeListItem(fields: OpenFields): ListItem {
  return { fields };
}

describe("isSyncableList", () => {
  const asList = (list: List["list"]): List => ({ list }) as List;

  it("syncs visible user-created custom lists", () => {
    expect(isSyncableList(asList({ template: "genericList" }))).toBe(true);
  });

  it("excludes hidden custom lists", () => {
    expect(
      isSyncableList(asList({ template: "genericList", hidden: true }))
    ).toBe(false);
  });

  it("excludes document, picture and page libraries", () => {
    expect(isSyncableList(asList({ template: "documentLibrary" }))).toBe(false);
    expect(isSyncableList(asList({ template: "pictureLibrary" }))).toBe(false);
    expect(isSyncableList(asList({ template: "webPageLibrary" }))).toBe(false);
  });

  it("excludes non-generic structured templates for now", () => {
    expect(isSyncableList(asList({ template: "events" }))).toBe(false);
    expect(isSyncableList(asList({ template: "tasks" }))).toBe(false);
  });

  it("excludes lists with no template or list facet", () => {
    expect(isSyncableList(asList({}))).toBe(false);
    expect(isSyncableList({} as List)).toBe(false);
  });
});

describe("isTableColumn", () => {
  it("keeps the primary Title field even though it is read-only", () => {
    expect(isTableColumn({ name: "Title", readOnly: true })).toBe(true);
  });

  it("keeps author-created data columns", () => {
    expect(isTableColumn({ name: "Status", displayName: "Status" })).toBe(true);
  });

  it("drops hidden and read-only columns", () => {
    expect(isTableColumn({ name: "Secret", hidden: true })).toBe(false);
    expect(isTableColumn({ name: "Computed", readOnly: true })).toBe(false);
  });

  it("drops SharePoint system/plumbing columns", () => {
    expect(isTableColumn({ name: "_UIVersionString" })).toBe(false);
    expect(isTableColumn({ name: "ContentType" })).toBe(false);
    expect(isTableColumn({ name: "Attachments" })).toBe(false);
    expect(isTableColumn({ name: "Custom", columnGroup: "_Hidden" })).toBe(
      false
    );
  });

  it("drops columns without a name", () => {
    expect(isTableColumn({} as ColumnDefinition)).toBe(false);
  });
});

describe("listItemsToRows", () => {
  const columns: ColumnDefinition[] = [
    { name: "Title", displayName: "Task" },
    { name: "Status", displayName: "Status" },
    { name: "Owner", displayName: "Owner" },
  ];

  it("emits a header row using display names", () => {
    const rows = listItemsToRows(columns, []);
    expect(rows).toEqual([["Task", "Status", "Owner"]]);
  });

  it("maps each item's fields into ordered cells", () => {
    const items = [
      makeListItem({ Title: "Ship it", Status: "Done" }),
      makeListItem({ Title: "Plan", Status: "Todo" }),
    ];

    expect(listItemsToRows(columns, items)).toEqual([
      ["Task", "Status", "Owner"],
      ["Ship it", "Done", ""],
      ["Plan", "Todo", ""],
    ]);
  });

  it("flattens person and lookup field objects to display strings", () => {
    const items = [
      makeListItem({
        Title: "Review",
        Owner: { displayName: "Ada Lovelace", email: "ada@example.com" },
      }),
    ];

    expect(listItemsToRows(columns, items)).toEqual([
      ["Task", "Status", "Owner"],
      ["Review", "", "Ada Lovelace"],
    ]);
  });

  it("falls back to an empty cell for missing/null values", () => {
    const items = [makeListItem({ Title: "Only title", Status: null })];

    expect(listItemsToRows(columns, items)).toEqual([
      ["Task", "Status", "Owner"],
      ["Only title", "", ""],
    ]);
  });
});

describe("isLookupLikeColumn", () => {
  it("detects person/group columns", () => {
    expect(isLookupLikeColumn({ name: "Owner", personOrGroup: {} })).toBe(true);
  });

  it("detects lookup columns", () => {
    expect(isLookupLikeColumn({ name: "Ref", lookup: { listId: "abc" } })).toBe(
      true
    );
  });

  it("treats plain columns as non-lookup", () => {
    expect(isLookupLikeColumn({ name: "Status" })).toBe(false);
  });
});

describe("listItemsToRows with lookup/person resolution", () => {
  const columns: ColumnDefinition[] = [
    { name: "Title", displayName: "Task" },
    { name: "Owner", displayName: "Owner", personOrGroup: {} },
    { name: "ref", displayName: "Ref", lookup: { listId: "l1" } },
  ];

  it("resolves person and lookup ids from the `<name>LookupId` field", () => {
    const items = [
      makeListItem({ Title: "A", OwnerLookupId: "10", refLookupId: "1" }),
    ];

    const resolvers = {
      Owner: { "10": "thomas draier" },
      ref: { "1": "Reference One" },
    };

    expect(listItemsToRows(columns, items, resolvers)).toEqual([
      ["Task", "Owner", "Ref"],
      ["A", "thomas draier", "Reference One"],
    ]);
  });

  it("joins multi-value lookups and falls back to the raw id when unresolved", () => {
    const items = [
      makeListItem({
        Title: "B",
        OwnerLookupId: ["10", "11"],
        refLookupId: "99",
      }),
    ];

    const resolvers = { Owner: { "10": "Ada", "11": "Grace" } };

    expect(listItemsToRows(columns, items, resolvers)).toEqual([
      ["Task", "Owner", "Ref"],
      ["B", "Ada, Grace", "99"],
    ]);
  });

  it("emits an empty cell when a lookup id is absent", () => {
    const items = [makeListItem({ Title: "C" })];

    expect(listItemsToRows(columns, items, {})).toEqual([
      ["Task", "Owner", "Ref"],
      ["C", "", ""],
    ]);
  });
});
