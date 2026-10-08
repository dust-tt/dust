import {
  applyBudgetOrderMoves,
  getBaseBudgetOrder,
  moveGroupPastVisibleNeighbor,
} from "@app/components/workspace/group_budget_order";
import { describe, expect, it } from "vitest";

describe("getBaseBudgetOrder", () => {
  it("adds the group last once it has a budget", () => {
    expect(getBaseBudgetOrder(["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
  });

  it("keeps the group in place when it already has a budget", () => {
    expect(getBaseBudgetOrder(["a", "c", "b"], "c", true)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("drops the group when its budget is removed", () => {
    expect(getBaseBudgetOrder(["a", "c", "b"], "c", false)).toEqual(["a", "b"]);
  });
});

describe("applyBudgetOrderMoves", () => {
  it("keeps the moves and follows groups added to or removed from the base order", () => {
    expect(applyBudgetOrderMoves(["b", "c", "a"], ["a", "b", "d"])).toEqual([
      "b",
      "a",
      "d",
    ]);
  });
});

describe("moveGroupPastVisibleNeighbor", () => {
  const order = ["a", "b", "c", "d", "e"];

  it("moves a group above the visible row above it, skipping hidden groups", () => {
    expect(
      moveGroupPastVisibleNeighbor(order, ["b", "c", "e"], "e", "up")
    ).toEqual(["a", "b", "e", "c", "d"]);
  });

  it("moves a group below the visible row below it, skipping hidden groups", () => {
    expect(
      moveGroupPastVisibleNeighbor(order, ["b", "c", "e"], "c", "down")
    ).toEqual(["a", "b", "d", "e", "c"]);
  });

  it("leaves the order unchanged at the edges", () => {
    expect(
      moveGroupPastVisibleNeighbor(order, ["b", "c", "e"], "b", "up")
    ).toEqual(order);
  });
});
