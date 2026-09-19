import type { SelectableConversationSpaceType } from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

import { buildSelectSpacesSlashCommandItems } from "./buildSelectSpacesSlashCommandItems";
import { SELECT_SPACE_SLASH_COMMAND_ACTION } from "./selectSpacesSlashCommand";

function makeSpace(sId: string, name: string): SelectableConversationSpaceType {
  return {
    createdAt: 0,
    groupIds: [],
    isRestricted: false,
    kind: "regular",
    name,
    sId,
    selected: false,
    updatedAt: 0,
  };
}

const SPACES = [
  makeSpace("spc_marketing", "Marketing"),
  makeSpace("spc_engops", "Eng Ops"),
  makeSpace("spc_sales", "Sales"),
];

describe("buildSelectSpacesSlashCommandItems", () => {
  it("returns one select-space row per unselected space, in order", () => {
    const items = buildSelectSpacesSlashCommandItems({
      query: "",
      selectedSpaceIds: [],
      spaces: SPACES,
    });

    expect(items.map((item) => item.label)).toEqual([
      "Marketing",
      "Eng Ops",
      "Sales",
    ]);
    expect(
      items.every((item) => item.action === SELECT_SPACE_SLASH_COMMAND_ACTION)
    ).toBe(true);
    expect(items.map((item) => item.data.space.sId)).toEqual([
      "spc_marketing",
      "spc_engops",
      "spc_sales",
    ]);
  });

  it("excludes already selected spaces", () => {
    const items = buildSelectSpacesSlashCommandItems({
      query: "",
      selectedSpaceIds: ["spc_engops", "spc_sales"],
      spaces: SPACES,
    });

    expect(items.map((item) => item.label)).toEqual(["Marketing"]);
  });

  it("matches the query as an in-order subsequence of the name", () => {
    expect(
      buildSelectSpacesSlashCommandItems({
        query: "mark",
        selectedSpaceIds: [],
        spaces: SPACES,
      }).map((item) => item.label)
    ).toEqual(["Marketing"]);

    // Spaces and hyphens are ignored on both sides, so "engops" reaches "Eng Ops".
    expect(
      buildSelectSpacesSlashCommandItems({
        query: "engops",
        selectedSpaceIds: [],
        spaces: SPACES,
      }).map((item) => item.label)
    ).toEqual(["Eng Ops"]);

    // Subsequence, not substring: "mkt" is in-order within "marketing".
    expect(
      buildSelectSpacesSlashCommandItems({
        query: "mkt",
        selectedSpaceIds: [],
        spaces: SPACES,
      }).map((item) => item.label)
    ).toEqual(["Marketing"]);

    expect(
      buildSelectSpacesSlashCommandItems({
        query: "zzz",
        selectedSpaceIds: [],
        spaces: SPACES,
      })
    ).toEqual([]);
  });

  it("ranks closer matches first", () => {
    const spaces = [
      makeSpace("spc_a", "Global Sales"),
      makeSpace("spc_b", "Sales"),
    ];

    expect(
      buildSelectSpacesSlashCommandItems({
        query: "sales",
        selectedSpaceIds: [],
        spaces,
      }).map((item) => item.label)
    ).toEqual(["Sales", "Global Sales"]);
  });
});
