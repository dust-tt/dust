import {
  AWU_PRICE_PER_CREDIT,
  amountCents,
  awuCreditsToCurrency,
  currencyToAwuCredits,
  metronomeAmount,
} from "@app/lib/metronome/amounts";
import { describe, expect, it } from "vitest";

describe("amountCents", () => {
  it("passes USD through (already in cents) and rounds to an integer", () => {
    expect(amountCents(1234, "usd")).toBe(1234);
    expect(amountCents(1234.4, "usd")).toBe(1234);
    expect(amountCents(1234.5, "usd")).toBe(1235);
  });

  it("converts EUR whole units to cents", () => {
    expect(amountCents(10, "eur")).toBe(1000);
    expect(amountCents(0.5, "eur")).toBe(50);
  });

  it("rounds EUR sub-cent fractions to the nearest cent", () => {
    expect(amountCents(0.0087, "eur")).toBe(1);
    expect(amountCents(0.004, "eur")).toBe(0);
  });
});

describe("metronomeAmount", () => {
  it("passes USD through (Metronome USD is already in cents)", () => {
    expect(metronomeAmount(1234, "usd")).toBe(1234);
    expect(metronomeAmount(0, "usd")).toBe(0);
  });

  it("converts EUR cents to whole units", () => {
    expect(metronomeAmount(1000, "eur")).toBe(10);
  });

  it("preserves EUR decimals (Metronome accepts decimal unit prices for non-USD)", () => {
    expect(metronomeAmount(50, "eur")).toBe(0.5);
    expect(metronomeAmount(0.87, "eur")).toBeCloseTo(0.0087, 10);
  });

  it("is the inverse of amountCents for round-trippable values", () => {
    expect(metronomeAmount(amountCents(12.34, "eur"), "eur")).toBeCloseTo(
      12.34,
      10
    );
    expect(metronomeAmount(amountCents(1234, "usd"), "usd")).toBe(1234);
  });
});

describe("awuCreditsToCurrency / currencyToAwuCredits", () => {
  it("uses the per-currency AWU rate", () => {
    expect(awuCreditsToCurrency(100, "usd")).toBeCloseTo(
      100 * AWU_PRICE_PER_CREDIT.usd,
      10
    );
    expect(awuCreditsToCurrency(100, "eur")).toBeCloseTo(
      100 * AWU_PRICE_PER_CREDIT.eur,
      10
    );
  });

  it("inverts cleanly between credits and currency units", () => {
    expect(currencyToAwuCredits(awuCreditsToCurrency(250, "usd"), "usd")).toBe(
      250
    );
    expect(
      currencyToAwuCredits(awuCreditsToCurrency(250, "eur"), "eur")
    ).toBeCloseTo(250, 10);
  });

  it("matches the AWU pricing constants (1 USD = 100 credits, 1 EUR ≈ 114.94 credits)", () => {
    expect(currencyToAwuCredits(1, "usd")).toBe(100);
    expect(currencyToAwuCredits(1, "eur")).toBeCloseTo(1 / 0.0087, 6);
  });
});
