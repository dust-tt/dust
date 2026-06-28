import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const cli = join(import.meta.dir, "cli.ts");
const fixture = (name: string) => join(import.meta.dir, "fixtures", name);

async function runCli(
  args: string[],
  stdin?: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", cli, ...args], {
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

describe("dust-functions CLI dispatch", () => {
  test("`run` invokes a handler and prints the response", async () => {
    const { code, stdout } = await runCli(
      ["run", fixture("hello.ts")],
      JSON.stringify({ url: "http://localhost/?name=cli" })
    );
    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.ok).toBe(true);
    expect(JSON.parse(out.response.body)).toEqual({ hello: "cli" });
  });

  test("`run` resolves a relative handler path against the working directory", async () => {
    const proc = Bun.spawn(["bun", cli, "run", "hello.ts"], {
      cwd: join(import.meta.dir, "fixtures"),
      stdin: new TextEncoder().encode(
        JSON.stringify({ url: "http://localhost/?name=rel" })
      ),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(JSON.parse(JSON.parse(stdout).response.body)).toEqual({
      hello: "rel",
    });
  });

  test("`run` exits nonzero with ok:false when the handler throws", async () => {
    const { code, stdout } = await runCli(
      ["run", fixture("throws.ts")],
      JSON.stringify({ url: "http://localhost/" })
    );
    expect(code).not.toBe(0);
    expect(JSON.parse(stdout).error.kind).toBe("threw");
  });

  test("`discover` prints the catalog for a folder", async () => {
    const { code, stdout } = await runCli([
      "discover",
      join(import.meta.dir, "fixtures", "catalog"),
    ]);
    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    expect(
      out.handlers.find((h: { name: string }) => h.name === "greet")
    ).toBeDefined();
  });

  test("--help prints usage to stdout and exits 0", async () => {
    const { code, stdout } = await runCli(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("dust-functions");
    expect(stdout).toContain("run");
    expect(stdout).toContain("discover");
  });

  test("no subcommand prints usage to stderr and exits 2", async () => {
    const { code, stderr } = await runCli([]);
    expect(code).toBe(2);
    expect(stderr).toContain("dust-functions");
  });

  test("an unknown subcommand exits 2", async () => {
    const { code, stderr } = await runCli(["frobnicate"]);
    expect(code).toBe(2);
    expect(stderr).toContain("frobnicate");
  });
});
