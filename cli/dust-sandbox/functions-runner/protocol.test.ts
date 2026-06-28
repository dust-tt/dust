import { describe, expect, test } from "bun:test";
import {
  BadInputError,
  decodeRequestBody,
  encodeResponseBody,
  parseInput,
} from "./protocol.ts";

describe("parseInput", () => {
  test("defaults method to GET and encoding to utf8", () => {
    const input = parseInput(JSON.stringify({ url: "http://localhost/" }));
    expect(input.method).toBe("GET");
    expect(input.encoding).toBe("utf8");
    expect(input.headers).toEqual({});
  });

  test("defaults url to http://localhost/ when omitted", () => {
    const input = parseInput(JSON.stringify({ method: "GET" }));
    expect(input.url).toBe("http://localhost/");
  });

  test("throws BadInputError on invalid JSON", () => {
    expect(() => parseInput("nope")).toThrow(BadInputError);
  });

  test("throws BadInputError when url is present but not a string", () => {
    expect(() => parseInput(JSON.stringify({ url: 42 }))).toThrow(
      BadInputError
    );
  });

  test("throws BadInputError on unknown encoding", () => {
    expect(() =>
      parseInput(JSON.stringify({ url: "http://x/", encoding: "hex" }))
    ).toThrow(BadInputError);
  });
});

describe("decodeRequestBody / encodeResponseBody", () => {
  test("utf8 round-trip", () => {
    const bytes = decodeRequestBody({
      method: "POST",
      url: "http://x/",
      headers: {},
      body: "héllo",
      encoding: "utf8",
    });
    expect(new TextDecoder().decode(bytes)).toBe("héllo");
  });

  test("base64 request body decodes to raw bytes", () => {
    const bytes = decodeRequestBody({
      method: "POST",
      url: "http://x/",
      headers: {},
      body: Buffer.from([0, 1, 255]).toString("base64"),
      encoding: "base64",
    });
    expect(Array.from(bytes!)).toEqual([0, 1, 255]);
  });

  test("non-UTF8 response bytes encode as base64", () => {
    const { body, encoding } = encodeResponseBody(new Uint8Array([0xff, 0xfe]));
    expect(encoding).toBe("base64");
    expect(Array.from(Buffer.from(body!, "base64"))).toEqual([0xff, 0xfe]);
  });
});
