import { describe, expect, test } from "bun:test";
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
    expect(JSON.parse(out.response.body)).toEqual({ hello: "r" });
  });

  test("exits 1 with ok:false when handler throws", async () => {
    const { stdout, code } = await run(
      ["run", fx("throws.ts")],
      JSON.stringify({ url: "http://localhost/" })
    );
    expect(code).toBe(1);
    expect(JSON.parse(stdout).error.kind).toBe("threw");
  });

  test("exits 2 with bad_input when stdin is malformed JSON", async () => {
    const { stdout, code } = await run(["run", fx("hello.ts")], "not json");
    expect(code).toBe(2);
    expect(JSON.parse(stdout).error.kind).toBe("bad_input");
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
