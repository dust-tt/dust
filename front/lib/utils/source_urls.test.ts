import {
  getSafeSourceUrl,
  isSafeHref,
  openSourceUrl,
} from "@app/lib/utils/source_urls";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("getSafeSourceUrl", () => {
  it.each([
    "https://example.com/doc",
    "http://example.com/a//b?x=1#frag",
    "https://example.com/path with spaces",
  ])("returns %s unchanged", (url) => {
    expect(getSafeSourceUrl(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "example.com/doc",
    "/relative/path",
    "",
    null,
    undefined,
  ])("returns null for %s", (url) => {
    expect(getSafeSourceUrl(url)).toBeNull();
  });
});

describe("openSourceUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens http(s) URLs in a new tab without opener access", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    openSourceUrl("https://example.com/doc");
    expect(open).toHaveBeenCalledWith(
      "https://example.com/doc",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("does not open non-http(s) URLs", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    openSourceUrl("javascript:alert(1)");
    openSourceUrl(null);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("isSafeHref", () => {
  it.each([
    "https://example.com/doc",
    "http://example.com",
    "mailto:support@dust.tt?subject=hi",
    "/w/abc/spaces",
    "relative/path",
    "?page=2",
    "#anchor",
    "//example.com/protocol-relative",
  ])("allows %s", (href) => {
    expect(isSafeHref(href)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    " javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "blob:https://example.com/uuid",
    "file:///etc/passwd",
  ])("rejects %s", (href) => {
    expect(isSafeHref(href)).toBe(false);
  });
});
