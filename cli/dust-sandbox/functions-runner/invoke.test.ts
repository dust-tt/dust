import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { invoke } from "./invoke.ts";
import type { RequestInput } from "./protocol.ts";

const fx = (n: string) => join(import.meta.dir, "fixtures", n);
const req = (o: Partial<RequestInput> = {}): RequestInput => ({
  method: "GET",
  url: "http://localhost/",
  headers: {},
  encoding: "utf8",
  ...o,
});

describe("invoke", () => {
  test("runs a handler and returns its 200 response", async () => {
    const out = await invoke(
      fx("hello.ts"),
      req({ url: "http://localhost/?name=bun" })
    );
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.response.status).toBe(200);
    expect(JSON.parse(out.response.body!)).toEqual({ hello: "bun" });
  });

  test("a 404 is still ok:true", async () => {
    const out = await invoke(fx("notfound.ts"), req());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.response.status).toBe(404);
    }
  });

  test("passes the request body through", async () => {
    const out = await invoke(
      fx("echo.ts"),
      req({ method: "POST", body: "payload" })
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.response.body).toBe("echo:POST:payload");
    }
  });

  test("binary response encodes as base64", async () => {
    const out = await invoke(fx("binary.ts"), req());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.response.encoding).toBe("base64");
    }
  });

  test("thrown handler → ok:false threw", async () => {
    const out = await invoke(fx("throws.ts"), req());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("threw");
    }
  });

  test("missing file → import_failed", async () => {
    const out = await invoke(fx("nope.ts"), req());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("import_failed");
    }
  });

  test("no fetch export → import_failed", async () => {
    const out = await invoke(fx("no-fetch.ts"), req());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("import_failed");
    }
  });

  test("non-Response return → bad_return", async () => {
    const out = await invoke(fx("bad-return.ts"), req());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("bad_return");
    }
  });

  test("valid body satisfies schema.input → 200", async () => {
    const out = await invoke(
      fx("greet.ts"),
      req({ method: "POST", body: JSON.stringify({ name: "David" }) })
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(JSON.parse(out.response.body!)).toEqual({ greeting: "Hi, David" });
    }
  });

  test("missing required field → 400 without calling handler", async () => {
    const out = await invoke(
      fx("greet.ts"),
      req({ method: "POST", body: "{}" })
    );
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.response.status).toBe(400);
    expect(JSON.parse(out.response.body!).error).toBe("invalid input");
  });

  test("non-JSON body with a schema → 400", async () => {
    const out = await invoke(
      fx("greet.ts"),
      req({ method: "POST", body: "not json" })
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.response.status).toBe(400);
    }
  });

  test("non-Zod schema.input is skipped (handler runs)", async () => {
    const out = await invoke(
      fx("bad-schema.ts"),
      req({ method: "POST", body: "{}" })
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.response.body).toBe("ok");
    }
  });
});
