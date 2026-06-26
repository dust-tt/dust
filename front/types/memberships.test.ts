import {
  expectedUserCreditState,
  initialCreditStateForSeatType,
  isSeatBased,
} from "@app/types/memberships";
import { describe, expect, it } from "vitest";

// A pro seat allocates 8000 AWU/month; max allocates 40000. These tests use
// round numbers and don't depend on the real constants.
const PRO_ALLOWANCE = 8000;
const CAP = 10000; // seat allowance + pool limit

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
        seatStartingBalanceAwu: PRO_ALLOWANCE,
        perUserCapAwuCredits: CAP,
        consumedAwuCredits: 0,
      })
    ).toBe("user_seat");
  });

  it("pro seat with ≤20% personal balance remaining → user_seat (no low-balance sub-state)", () => {
    expect(
      expectedUserCreditState({
        seatType: "pro",
        seatBalanceAwu: 0.2 * PRO_ALLOWANCE,
        seatStartingBalanceAwu: PRO_ALLOWANCE,
        perUserCapAwuCredits: CAP,
        consumedAwuCredits: 0.8 * PRO_ALLOWANCE,
      })
    ).toBe("user_seat");
  });

  it("pro seat with exhausted personal balance, below the cap warning → on_pool", () => {
    expect(
      expectedUserCreditState({
        seatType: "pro",
        seatBalanceAwu: 0,
        seatStartingBalanceAwu: PRO_ALLOWANCE,
        // Cap well above consumption so we land on plain on_pool, not the 80% band.
        perUserCapAwuCredits: 20000,
        consumedAwuCredits: PRO_ALLOWANCE,
      })
    ).toBe("on_pool");
  });

  it("free seat with personal balance → user_seat", () => {
    expect(
      expectedUserCreditState({
        seatType: "free",
        seatBalanceAwu: 300,
        seatStartingBalanceAwu: 300,
        perUserCapAwuCredits: null,
        consumedAwuCredits: null,
      })
    ).toBe("user_seat");
  });

  it("free seat with exhausted balance → capped (no pool fallback)", () => {
    expect(
      expectedUserCreditState({
        seatType: "free",
        seatBalanceAwu: 0,
        seatStartingBalanceAwu: 300,
        perUserCapAwuCredits: null,
        consumedAwuCredits: null,
      })
    ).toBe("capped");
  });

  it("free seat with unknown balance → user_seat (never on_pool)", () => {
    // A free seat has no pool fallback, so an unknown (null) balance must not
    // route to on_pool — it stays on the seat until the balance is known 0.
    expect(
      expectedUserCreditState({
        seatType: "free",
        seatBalanceAwu: null,
        seatStartingBalanceAwu: null,
        perUserCapAwuCredits: null,
        consumedAwuCredits: null,
      })
    ).toBe("user_seat");
  });

  it("pool-based (workspace) seat → on_pool (no personal seat balance)", () => {
    expect(
      expectedUserCreditState({
        seatType: "workspace",
        seatBalanceAwu: null,
        seatStartingBalanceAwu: null,
        perUserCapAwuCredits: CAP,
        consumedAwuCredits: 0,
      })
    ).toBe("on_pool");
  });

  it("consumption ≥ cap → capped (hard block wins over seat balance)", () => {
    expect(
      expectedUserCreditState({
        seatType: "pro",
        // Even with a (stale) positive seat balance, hitting the cap blocks.
        seatBalanceAwu: 10,
        seatStartingBalanceAwu: PRO_ALLOWANCE,
        perUserCapAwuCredits: CAP,
        consumedAwuCredits: CAP,
      })
    ).toBe("capped");
  });

  it("on pool at ≥80% of cap → on_pool (near-limit tracked separately via nearLimit flag)", () => {
    expect(
      expectedUserCreditState({
        seatType: "workspace",
        seatBalanceAwu: null,
        seatStartingBalanceAwu: null,
        perUserCapAwuCredits: CAP,
        consumedAwuCredits: 0.8 * CAP,
      })
    ).toBe("on_pool");
  });

  it("no cap configured → never capped (uncapped pool user)", () => {
    expect(
      expectedUserCreditState({
        seatType: "workspace",
        seatBalanceAwu: null,
        seatStartingBalanceAwu: null,
        perUserCapAwuCredits: null,
        consumedAwuCredits: null,
      })
    ).toBe("on_pool");
  });
});
