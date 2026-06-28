import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { RequestInput } from "./protocol.ts";
import { invoke } from "./run_request.ts";

const fixture = (name: string) => join(import.meta.dir, "fixtures", name);

const req = (over: Partial<RequestInput> = {}): RequestInput => ({
  method: "GET",
  url: "http://localhost/",
  headers: {},
  encoding: "utf8",
  ...over,
});

describe("invoke", () => {
  test("runs a handler and returns its 200 response", async () => {
    const out = await invoke(
      fixture("hello.ts"),
      req({ url: "http://localhost/?name=bun" })
    );
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.response.status).toBe(200);
    expect(JSON.parse(out.response.body!)).toEqual({ hello: "bun" });
  });

  test("a 404 response is still a successful invocation (ok:true)", async () => {
    const out = await invoke(fixture("notfound.ts"), req());
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.response.status).toBe(404);
    expect(out.response.body).toBe("nope");
  });

  test("passes the request body through to the handler", async () => {
    const out = await invoke(
      fixture("echo.ts"),
      req({ method: "POST", body: "payload", encoding: "utf8" })
    );
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.response.body).toBe("echo:POST:payload");
    expect(out.response.headers["x-echo"]).toBe("1");
  });

  test("encodes a binary response body as base64", async () => {
    const out = await invoke(fixture("binary.ts"), req());
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.response.encoding).toBe("base64");
    expect(Array.from(Buffer.from(out.response.body!, "base64"))).toEqual([
      0xff, 0xfe, 0x00, 0x42,
    ]);
  });

  test("reports a thrown error as ok:false threw", async () => {
    const out = await invoke(fixture("throws.ts"), req());
    expect(out.ok).toBe(false);
    if (out.ok) {
      return;
    }
    expect(out.error.kind).toBe("threw");
    expect(out.error.message).toContain("boom");
  });

  test("reports a missing file as import_failed", async () => {
    const out = await invoke(fixture("does-not-exist.ts"), req());
    expect(out.ok).toBe(false);
    if (out.ok) {
      return;
    }
    expect(out.error.kind).toBe("import_failed");
  });

  test("reports a handler without fetch as import_failed", async () => {
    const out = await invoke(fixture("no-fetch.ts"), req());
    expect(out.ok).toBe(false);
    if (out.ok) {
      return;
    }
    expect(out.error.kind).toBe("import_failed");
  });

  test("reports a non-Response return as bad_return", async () => {
    const out = await invoke(fixture("bad-return.ts"), req());
    expect(out.ok).toBe(false);
    if (out.ok) {
      return;
    }
    expect(out.error.kind).toBe("bad_return");
  });
});

describe("run_request input validation (schema.input)", () => {
  const greet = fixture("catalog/greet.ts");

  test("calls the handler for a body that satisfies schema.input", async () => {
    const out = await invoke(
      greet,
      req({ method: "POST", body: JSON.stringify({ name: "David" }) })
    );
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.response.status).toBe(200);
    expect(JSON.parse(out.response.body!)).toEqual({ greeting: "Hi, David" });
  });

  test("returns 400 without calling the handler when required field missing", async () => {
    const out = await invoke(
      greet,
      req({ method: "POST", body: JSON.stringify({}) })
    );
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.response.status).toBe(400);
    const body = JSON.parse(out.response.body!);
    expect(body.error).toBe("invalid input");
    expect(body.issues[0].path).toEqual(["name"]);
  });

  test("returns 400 when the body is not valid JSON", async () => {
    const out = await invoke(greet, req({ method: "POST", body: "not json" }));
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.response.status).toBe(400);
  });

  test("skips validation when schema.input is not a Zod type", async () => {
    // bad-schema declares input as a plain object; run_request can't validate
    // it, so it must call the handler normally rather than reject.
    const out = await invoke(
      fixture("catalog/bad-schema.ts"),
      req({ method: "POST", body: JSON.stringify({}) })
    );
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.response.status).toBe(200);
    expect(out.response.body).toBe("ok");
  });

  test("does not validate handlers that declare no schema", async () => {
    const out = await invoke(
      fixture("echo.ts"),
      req({ method: "POST", body: "anything" })
    );
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.response.status).toBe(200);
  });
});
