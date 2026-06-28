import { describe, expect, test } from "bun:test";
import {
  BadInputError,
  decodeRequestBody,
  encodeResponseBody,
  parseInput,
} from "./protocol.ts";

describe("parseInput", () => {
  test("parses a minimal request and defaults method to GET", () => {
    const input = parseInput(JSON.stringify({ url: "http://localhost/" }));
    expect(input.method).toBe("GET");
    expect(input.url).toBe("http://localhost/");
    expect(input.headers).toEqual({});
    expect(input.body).toBeUndefined();
    expect(input.encoding).toBe("utf8");
  });

  test("preserves method, headers, body, and encoding", () => {
    const input = parseInput(
      JSON.stringify({
        method: "POST",
        url: "http://localhost/foo",
        headers: { "content-type": "application/json" },
        body: "aGk=",
        encoding: "base64",
      })
    );
    expect(input.method).toBe("POST");
    expect(input.headers).toEqual({ "content-type": "application/json" });
    expect(input.body).toBe("aGk=");
    expect(input.encoding).toBe("base64");
  });

  test("throws BadInputError on invalid JSON", () => {
    expect(() => parseInput("not json")).toThrow(BadInputError);
  });

  test("throws BadInputError when url is missing", () => {
    expect(() => parseInput(JSON.stringify({ method: "GET" }))).toThrow(
      BadInputError
    );
  });

  test("throws BadInputError on unknown encoding", () => {
    expect(() =>
      parseInput(JSON.stringify({ url: "http://x/", encoding: "hex" }))
    ).toThrow(BadInputError);
  });
});

describe("decodeRequestBody", () => {
  test("returns undefined when no body", () => {
    expect(
      decodeRequestBody({
        method: "GET",
        url: "http://x/",
        headers: {},
        encoding: "utf8",
      })
    ).toBeUndefined();
  });

  test("decodes utf8 body to bytes", () => {
    const bytes = decodeRequestBody({
      method: "POST",
      url: "http://x/",
      headers: {},
      body: "héllo",
      encoding: "utf8",
    });
    expect(new TextDecoder().decode(bytes)).toBe("héllo");
  });

  test("decodes base64 body to bytes", () => {
    const bytes = decodeRequestBody({
      method: "POST",
      url: "http://x/",
      headers: {},
      body: Buffer.from([0, 1, 2, 255]).toString("base64"),
      encoding: "base64",
    });
    expect(Array.from(bytes!)).toEqual([0, 1, 2, 255]);
  });
});

describe("encodeResponseBody", () => {
  test("encodes valid UTF-8 bytes as utf8 text", () => {
    const { body, encoding } = encodeResponseBody(
      new TextEncoder().encode("héllo")
    );
    expect(encoding).toBe("utf8");
    expect(body).toBe("héllo");
  });

  test("encodes non-UTF-8 bytes as base64", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00]);
    const { body, encoding } = encodeResponseBody(bytes);
    expect(encoding).toBe("base64");
    expect(Array.from(Buffer.from(body!, "base64"))).toEqual([
      0xff, 0xfe, 0x00,
    ]);
  });

  test("encodes empty body as empty utf8 string", () => {
    const { body, encoding } = encodeResponseBody(new Uint8Array(0));
    expect(encoding).toBe("utf8");
    expect(body).toBe("");
  });
});
