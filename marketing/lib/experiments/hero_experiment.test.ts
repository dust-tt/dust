import { describe, expect, it } from "vitest";

import {
  DEFAULT_HERO_VARIANT,
  HERO_CONTENT,
  HERO_VARIANT_KEYS,
  isHeroVariantKey,
  toHeroVariant,
} from "@marketing/lib/experiments/hero_experiment";

describe("hero_experiment", () => {
  describe("toHeroVariant", () => {
    it("returns the variant for a known key", () => {
      expect(toHeroVariant("control")).toBe("control");
      expect(toHeroVariant("collaboration")).toBe("collaboration");
    });

    it("falls back to control for unknown / absent flag values", () => {
      // These mirror what PostHog can hand back: an unmapped multivariate
      // string, a boolean flag, undefined on eval failure, or null.
      expect(toHeroVariant("some-other-variant")).toBe(DEFAULT_HERO_VARIANT);
      expect(toHeroVariant(true)).toBe(DEFAULT_HERO_VARIANT);
      expect(toHeroVariant(false)).toBe(DEFAULT_HERO_VARIANT);
      expect(toHeroVariant(undefined)).toBe(DEFAULT_HERO_VARIANT);
      expect(toHeroVariant(null)).toBe(DEFAULT_HERO_VARIANT);
    });

    it("uses control as the default variant", () => {
      expect(DEFAULT_HERO_VARIANT).toBe("control");
    });
  });

  describe("isHeroVariantKey", () => {
    it("is true only for exact, valid variant keys", () => {
      expect(isHeroVariantKey("control")).toBe(true);
      expect(isHeroVariantKey("collaboration")).toBe(true);
    });

    it("is false for anything else", () => {
      expect(isHeroVariantKey("Control")).toBe(false);
      expect(isHeroVariantKey("")).toBe(false);
      expect(isHeroVariantKey("bogus")).toBe(false);
      expect(isHeroVariantKey(undefined)).toBe(false);
      expect(isHeroVariantKey(null)).toBe(false);
      expect(isHeroVariantKey(true)).toBe(false);
    });
  });

  describe("HERO_CONTENT", () => {
    it("has content for every declared variant key", () => {
      for (const key of HERO_VARIANT_KEYS) {
        expect(HERO_CONTENT[key]).toBeDefined();
        expect(HERO_CONTENT[key].headlineLine1.length).toBeGreaterThan(0);
        expect(HERO_CONTENT[key].primaryCtaLabel.length).toBeGreaterThan(0);
        expect(HERO_CONTENT[key].secondaryCtaLabel.length).toBeGreaterThan(0);
      }
    });

    it("renders the office scene for control (no video)", () => {
      expect(HERO_CONTENT.control.heroVideo).toBeUndefined();
    });

    it("renders a customer-story video for collaboration", () => {
      expect(HERO_CONTENT.collaboration.heroVideo?.youtubeId).toBeTruthy();
      expect(HERO_CONTENT.collaboration.heroVideo?.title).toBeTruthy();
    });
  });
});
