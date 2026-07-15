import { encodeUtf8HeaderValue } from "@dust-tt/client";
import { describe, expect, it } from "vitest";

import { decodeUtf8HeaderValue } from "./http_headers";

// Contract test between the sender (DustAPI's `encodeUtf8HeaderValue` in
// @dust-tt/client, applied to extra headers in `baseHeaders`) and the receiver
// (`decodeUtf8HeaderValue`, used by the front-api auth middleware).
describe("encodeUtf8HeaderValue / decodeUtf8HeaderValue", () => {
  it("passes ASCII values through raw", () => {
    expect(encodeUtf8HeaderValue("prod-key-01")).toBe("prod-key-01");
    expect(encodeUtf8HeaderValue("user@example.com")).toBe("user@example.com");
  });

  it("passes Latin-1 values (é, ø, ü) through raw", () => {
    expect(encodeUtf8HeaderValue("Clé de prod")).toBe("Clé de prod");
    expect(encodeUtf8HeaderValue("søren.müller@example.com")).toBe(
      "søren.müller@example.com"
    );
  });

  it("encodes values with characters above 0xFF as an encoded-word", () => {
    const encoded = encodeUtf8HeaderValue("Clé 🔑 złoty");
    expect(encoded).toMatch(/^=\?utf-8\?B\?[A-Za-z0-9+/]*={0,2}\?=$/);
    // The encoded form is a valid header value.
    expect(() => new Headers({ "x-test": encoded })).not.toThrow();
  });

  it("round-trips non-Latin-1 values losslessly", () => {
    for (const value of [
      "Clé 🔑 złoty smørrebrød",
      "иван@example.ru",
      "田中@example.jp",
      "line\nbreak",
    ]) {
      expect(decodeUtf8HeaderValue(encodeUtf8HeaderValue(value))).toBe(value);
    }
  });

  it("returns raw values unchanged on decode", () => {
    expect(decodeUtf8HeaderValue("user@example.com")).toBe("user@example.com");
    expect(decodeUtf8HeaderValue("Clé de prod")).toBe("Clé de prod");
    // '%' is legal in an email local part and must not be interpreted.
    expect(decodeUtf8HeaderValue("a%40b@example.com")).toBe(
      "a%40b@example.com"
    );
  });

  it("round-trips a raw value that itself looks like an encoded-word", () => {
    const tricky = "=?utf-8?B?bm90IHJlYWxseQ==?=";
    expect(decodeUtf8HeaderValue(encodeUtf8HeaderValue(tricky))).toBe(tricky);
  });

  it("returns malformed encoded-word lookalikes unchanged", () => {
    // Invalid base64 characters: does not match the envelope, comes back raw.
    expect(decodeUtf8HeaderValue("=?utf-8?B?!!!?=")).toBe("=?utf-8?B?!!!?=");
    // Unsupported charset: not ours, comes back raw.
    expect(decodeUtf8HeaderValue("=?iso-8859-1?Q?a=E9?=")).toBe(
      "=?iso-8859-1?Q?a=E9?="
    );
  });
});
