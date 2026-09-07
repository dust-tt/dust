import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const runner = join(import.meta.dir, "runner.ts");
const fx = (n: string) => join(import.meta.dir, "fixtures", n);

async function run(args: string[], stdin?: string) {
  const proc = Bun.spawn(["bun", runner, ...args], {
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  return { stdout, code };
}

describe("runner run", () => {
  test("invokes a handler from stdin envelope", async () => {
    const { stdout, code } = await run(
      ["run", fx("hello.ts")],
      JSON.stringify({ url: "http://localhost/?name=r" })
    );
    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.output).toEqual({ hello: "r" });
  });

  test("creates function-authored files group-writable (umask 007)", async () => {
    // A sandbox database a function opens directly must stay writable by group
    // `agent`, or litestream can never replicate it.
    const { stdout, code } = await run(
      ["run", fx("file-mode-probe.ts")],
      JSON.stringify({ url: "http://localhost/" })
    );
    expect(code).toBe(0);
    expect(JSON.parse(stdout).output.mode).toBe(0o660);
  });

  test("delivers an inline envelope larger than the pipe buffer intact", async () => {
    // Regression: process.exit does not drain queued async stdout writes, so
    // an envelope bigger than the kernel pipe buffer (64KB) but under the
    // inline cap was cut mid-JSON. It must reach the reader whole.
    const { stdout, code } = await run(
      ["run", fx("big-output.ts")],
      JSON.stringify({ url: "http://localhost/?size=200000" })
    );
    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.ok).toBe(true);
    expect(out.output.big.length).toBe(200_000);
  });

  test("spills a 2MB result to a file and emits a pointer envelope", async () => {
    const { stdout, code } = await run(
      ["run", fx("big-output.ts")],
      JSON.stringify({ url: "http://localhost/" })
    );
    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.ok).toBe(true);
    expect(out.resultFile).toStartWith("/tmp/dust-fn-results/");
    const spilled = readFileSync(out.resultFile, "utf8");
    rmSync(out.resultFile, { force: true });
    expect(out.resultBytes).toBe(Buffer.byteLength(spilled, "utf8"));
    const envelope = JSON.parse(spilled);
    expect(envelope.ok).toBe(true);
    expect(envelope.output.big.length).toBe(2 * 1024 * 1024);
  });

  test("refuses a result over the hard cap with output_too_large", async () => {
    const { stdout, code } = await run(
      ["run", fx("big-output.ts")],
      JSON.stringify({ url: `http://localhost/?size=${6 * 1024 * 1024}` })
    );
    expect(code).toBe(1);
    const out = JSON.parse(stdout);
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("output_too_large");
    expect(out.error.message).toContain("bytes");
  });

  test("exits 1 with ok:false when handler throws", async () => {
    const { stdout, code } = await run(
      ["run", fx("throws.ts")],
      JSON.stringify({ url: "http://localhost/" })
    );
    expect(code).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("threw");
  });

  test("exits 2 with bad_input when stdin is malformed JSON", async () => {
    const { stdout, code } = await run(["run", fx("hello.ts")], "not json");
    expect(code).toBe(2);
    expect(JSON.parse(stdout).error.code).toBe("bad_input");
  });

  test("returns invalid_input when schema.input validation throws", async () => {
    const { stdout, code } = await run(
      ["run", fx("throwing-schema.ts")],
      JSON.stringify({ body: "{}" })
    );
    expect(code).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("invalid_input");
  });

  test("returns invalid_output when parsed output cannot be serialized", async () => {
    const { stdout, code } = await run(
      ["run", fx("unserializable-output.ts")],
      JSON.stringify({})
    );
    expect(code).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("invalid_output");
  });

  test("returns invalid_output when schema.output validation throws", async () => {
    const { stdout, code } = await run(
      ["run", fx("throwing-output-schema.ts")],
      JSON.stringify({})
    );
    expect(code).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("invalid_output");
  });
});

describe("runner get", () => {
  test("prints the schema for a function", async () => {
    const { stdout, code } = await run(["get", fx("greet.ts")]);
    expect(code).toBe(0);
    const s = JSON.parse(stdout);
    expect(s.name).toBe("greet");
    expect(s.input_schema.required).toContain("name");
  });

  test("exits nonzero with {error} when no schema", async () => {
    const { stdout, code } = await run(["get", fx("no-schema.ts")]);
    expect(code).not.toBe(0);
    expect(JSON.parse(stdout).error).toContain("schema");
  });
});

describe("runner usage", () => {
  test("unknown subcommand exits 2", async () => {
    const { code } = await run(["frobnicate", fx("hello.ts")]);
    expect(code).toBe(2);
  });
});
