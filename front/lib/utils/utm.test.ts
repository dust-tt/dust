import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/utils/anonymous_id", () => ({
  getRootCookieDomain: vi.fn().mockReturnValue(""),
  buildDustAidCookieString: vi.fn((v: string) => `_dust_aid=${v}`),
}));

vi.mock("posthog-js", () => ({
  posthog: { get_distinct_id: vi.fn().mockReturnValue(null) },
}));

import {
  isValidClickIdValue,
  persistClickIdCookies,
} from "@app/lib/utils/utm";

// ---------------------------------------------------------------------------
// isValidClickIdValue
// ---------------------------------------------------------------------------

describe("isValidClickIdValue", () => {
  it("accepts real-world gclid-shaped values", () => {
    expect(isValidClickIdValue("EAIaIQobChMI")).toBe(true);
    expect(isValidClickIdValue("CjwKCAiA3Z-ABCdef")).toBe(true);
  });

  it("accepts values with hyphens, underscores and dots", () => {
    expect(isValidClickIdValue("abc-DEF_123.xyz")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidClickIdValue("")).toBe(false);
  });

  it("rejects values containing angle brackets (XSS payload)", () => {
    expect(isValidClickIdValue("<script")).toBe(false);
    expect(isValidClickIdValue(">alert(1)")).toBe(false);
  });

  it("rejects percent-encoded payloads that WAFs decode before inspection", () => {
    expect(isValidClickIdValue("%3Cscript")).toBe(false);
  });

  it("rejects values with spaces", () => {
    expect(isValidClickIdValue("hello world")).toBe(false);
  });

  it("rejects quote injection", () => {
    expect(isValidClickIdValue('foo";alert(1)')).toBe(false);
  });

  it("rejects query-string injection characters", () => {
    expect(isValidClickIdValue("foo&bar=baz")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// persistClickIdCookies
// ---------------------------------------------------------------------------

describe("persistClickIdCookies", () => {
  beforeEach(() => {
    // Reset cookies between tests by clearing the jsdom cookie store.
    document.cookie
      .split(";")
      .map((c) => c.trim().split("=")[0])
      .filter(Boolean)
      .forEach((name) => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      });
  });

  it("persists a valid msclkid value as _dust_msclkid cookie", () => {
    persistClickIdCookies({ msclkid: "ValidClickId123" });
    expect(document.cookie).toContain("_dust_msclkid=ValidClickId123");
  });

  it("persists a valid li_fat_id value as _dust_li_fat_id cookie", () => {
    persistClickIdCookies({ li_fat_id: "AQIDAHjB3w-ABC" });
    expect(document.cookie).toContain("_dust_li_fat_id=AQIDAHjB3w-ABC");
  });

  it("does NOT write a cookie when msclkid contains an XSS payload", () => {
    persistClickIdCookies({ msclkid: "<script" });
    expect(document.cookie).not.toContain("_dust_msclkid");
  });

  it("does NOT write a cookie when msclkid contains a percent-encoded payload", () => {
    // This is the exact vector from HackerOne #3685798:
    // ?msclkid=%3Cscript -> value is '<script' after URL decoding by the browser.
    // Even if the raw string '%3Cscript' reached persistClickIdCookies it must
    // be rejected because the percent sign is outside the allowlist.
    persistClickIdCookies({ msclkid: "%3Cscript" });
    expect(document.cookie).not.toContain("_dust_msclkid");
  });

  it("does NOT write a cookie when li_fat_id contains an XSS payload", () => {
    persistClickIdCookies({ li_fat_id: "<script" });
    expect(document.cookie).not.toContain("_dust_li_fat_id");
  });

  it("writes valid click IDs while ignoring invalid ones in the same call", () => {
    persistClickIdCookies({
      msclkid: "<script",
      gclid: "EAIaIQobChMI",
    });
    expect(document.cookie).not.toContain("_dust_msclkid");
    expect(document.cookie).toContain("_dust_gclid=EAIaIQobChMI");
  });

  it("does nothing when params object is empty", () => {
    persistClickIdCookies({});
    expect(document.cookie).toBe("");
  });
});
