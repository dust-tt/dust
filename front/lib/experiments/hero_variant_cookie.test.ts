import { afterEach, describe, expect, it } from "vitest";

import {
  HERO_VARIANT_COOKIE,
  readHeroVariantFromDocumentCookie,
} from "./hero_variant_cookie";

// Expire anything jsdom retained between tests so cookie reads start clean.
afterEach(() => {
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0];
    if (name) {
      document.cookie = `${name}=; max-age=0`;
    }
  }
});

describe("readHeroVariantFromDocumentCookie", () => {
  it("reads the hero variant marketing set in the shared cookie", () => {
    document.cookie = `${HERO_VARIANT_COOKIE}=collaboration`;
    expect(readHeroVariantFromDocumentCookie()).toBe("collaboration");
  });

  it("returns the value opaquely without validating against known variants", () => {
    // `front` treats the value as an opaque tracking property, so a variant it
    // has never heard of (added on the marketing side) still round-trips.
    document.cookie = `${HERO_VARIANT_COOKIE}=some-future-variant`;
    expect(readHeroVariantFromDocumentCookie()).toBe("some-future-variant");
  });

  it("finds the cookie among other cookies", () => {
    document.cookie = "foo=bar";
    document.cookie = `${HERO_VARIANT_COOKIE}=control`;
    expect(readHeroVariantFromDocumentCookie()).toBe("control");
  });

  it("returns null when the cookie is absent", () => {
    expect(readHeroVariantFromDocumentCookie()).toBeNull();
  });
});
