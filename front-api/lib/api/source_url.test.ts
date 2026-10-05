import { parseSourceUrlParam } from "@front-api/lib/api/source_url";
import { describe, expect, it } from "vitest";

describe("parseSourceUrlParam", () => {
  it.each([null, undefined, ""])("returns null for %s", (value) => {
    const res = parseSourceUrlParam(value);
    expect(res.isOk() && res.value).toBeNull();
  });

  it("returns the standardized URL for http(s) values", () => {
    const res = parseSourceUrlParam("HTTPS://Example.com/foo");
    expect(res.isOk() && res.value).toBe("https://example.com/foo");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "example.com/doc",
  ])("returns a 400 invalid_request_error for %s", (value) => {
    const res = parseSourceUrlParam(value);
    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.status_code).toBe(400);
      expect(res.error.api_error.type).toBe("invalid_request_error");
    }
  });
});
