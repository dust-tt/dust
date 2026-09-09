import {
  expectedUserCreditState,
  initialCreditStateForSeatType,
  isSeatBased,
} from "@app/types/memberships";
import { describe, expect, it } from "vitest";

// A pro seat allocates 8000 AWU/month; max allocates 40000. These tests use
// round numbers and don't depend on the real constants.
const PRO_ALLOWANCE = 8000;

describe("isSeatBased", () => {
  it("pro/max/free seats are seat-based", () => {
    expect(isSeatBased("pro")).toBe(true);
    expect(isSeatBased("pro_yearly")).toBe(true);
    expect(isSeatBased("max")).toBe(true);
    expect(isSeatBased("max_yearly")).toBe(true);
    expect(isSeatBased("free")).toBe(true);
  });

  it("workspace seats and unset seats are not seat-based", () => {
    expect(isSeatBased("workspace")).toBe(false);
    expect(isSeatBased("workspace_yearly")).toBe(false);
    expect(isSeatBased(null)).toBe(false);
    expect(isSeatBased(undefined)).toBe(false);
  });
});

describe("initialCreditStateForSeatType", () => {
  it("seat-based seats (pro/max/free) start in user_seat", () => {
    expect(initialCreditStateForSeatType("pro")).toBe("user_seat");
    expect(initialCreditStateForSeatType("pro_yearly")).toBe("user_seat");
    expect(initialCreditStateForSeatType("max")).toBe("user_seat");
    expect(initialCreditStateForSeatType("max_yearly")).toBe("user_seat");
    expect(initialCreditStateForSeatType("free")).toBe("user_seat");
  });

  it("pool-based and unset seats start on_pool", () => {
    expect(initialCreditStateForSeatType("workspace")).toBe("on_pool");
    expect(initialCreditStateForSeatType("workspace_yearly")).toBe("on_pool");
    expect(initialCreditStateForSeatType(null)).toBe("on_pool");
    expect(initialCreditStateForSeatType(undefined)).toBe("on_pool");
  });
});

describe("expectedUserCreditState", () => {
  it("pro seat with full personal balance → user_seat", () => {
    expect(
      expectedUserCreditState({
        seatType: "pro",
        seatBalanceAwu: PRO_ALLOWANCE,
      })
    ).toBe("user_seat");
  });

  it("pro seat with a low (but positive) personal balance → user_seat", () => {
    expect(
      expectedUserCreditState({
        seatType: "pro",
        seatBalanceAwu: 0.2 * PRO_ALLOWANCE,
      })
    ).toBe("user_seat");
  });

  it("pro seat with exhausted personal balance → on_pool (pool fallback)", () => {
    expect(
      expectedUserCreditState({
        seatType: "pro",
        seatBalanceAwu: 0,
      })
    ).toBe("on_pool");
  });

  it("pro seat with unknown balance → user_seat (only a known 0 routes to the pool)", () => {
    expect(
      expectedUserCreditState({
        seatType: "pro",
        seatBalanceAwu: null,
      })
    ).toBe("user_seat");
  });

  it("free seat with personal balance → user_seat", () => {
    expect(
      expectedUserCreditState({
        seatType: "free",
        seatBalanceAwu: 300,
      })
    ).toBe("user_seat");
  });

  it("free seat with exhausted balance → user_seat (no pool fallback)", () => {
    expect(
      expectedUserCreditState({
        seatType: "free",
        seatBalanceAwu: 0,
      })
    ).toBe("user_seat");
  });

  it("free seat with unknown balance → user_seat (never on_pool)", () => {
    // A free seat has no pool fallback, so an unknown (null) balance must not
    // route to on_pool — it stays on the seat.
    expect(
      expectedUserCreditState({
        seatType: "free",
        seatBalanceAwu: null,
      })
    ).toBe("user_seat");
  });

  it("pool-based (workspace) seat → on_pool (no personal seat balance)", () => {
    expect(
      expectedUserCreditState({
        seatType: "workspace",
        seatBalanceAwu: null,
      })
    ).toBe("on_pool");
  });

  it("unset seat → on_pool", () => {
    expect(
      expectedUserCreditState({
        seatType: null,
        seatBalanceAwu: null,
      })
    ).toBe("on_pool");
  });
});
