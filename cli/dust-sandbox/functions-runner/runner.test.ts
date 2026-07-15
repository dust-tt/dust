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
    expect(out.output).toEqual({ hello: "r" });
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
