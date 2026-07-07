import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runner = join(import.meta.dir, "runner.ts");
const fx = (n: string) => join(import.meta.dir, "fixtures", n);

async function run(args: string[]) {
  const proc = Bun.spawn(["bun", runner, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);

  return { stdout, code };
}

async function withOutDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "dsbx-build-test-"));

  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("runner build", () => {
  test("bundles a function and writes the bundle + schema", async () => {
    await withOutDir(async (dir) => {
      const bundlePath = join(dir, "greet.ts");
      const schemaPath = join(dir, "greet.schema.json");
      const { stdout, code } = await run([
        "build",
        fx("greet.ts"),
        bundlePath,
        schemaPath,
      ]);

      expect(code).toBe(0);
      expect(JSON.parse(stdout)).toEqual({ ok: true });

      // External packages stay as imports, only relative code is inlined.
      const bundle = await readFile(bundlePath, "utf8");
      expect(bundle).toContain('from "zod"');

      const schema = JSON.parse(await readFile(schemaPath, "utf8"));
      expect(schema.description).toBe("Greet a user by name");
      expect(schema.input_schema.required).toContain("name");
      expect(schema.output_schema.required).toContain("greeting");
    });
  });

  test("exits 1 with build_failed on a missing source", async () => {
    await withOutDir(async (dir) => {
      const { stdout, code } = await run([
        "build",
        fx("does-not-exist.ts"),
        join(dir, "out.ts"),
        join(dir, "out.json"),
      ]);
      expect(code).toBe(1);
      expect(JSON.parse(stdout).error.kind).toBe("build_failed");
    });
  });

  test("exits 1 with schema_extraction_failed when the function has no schema", async () => {
    await withOutDir(async (dir) => {
      const { stdout, code } = await run([
        "build",
        fx("no-schema.ts"),
        join(dir, "out.ts"),
        join(dir, "out.json"),
      ]);
      expect(code).toBe(1);
      expect(JSON.parse(stdout).error.kind).toBe("schema_extraction_failed");
    });
  });

  test("exits 2 with bad_args when output paths are missing", async () => {
    const { stdout, code } = await run(["build", fx("greet.ts")]);
    expect(code).toBe(2);
    expect(JSON.parse(stdout).error.kind).toBe("bad_args");
  });

  test("writes manifest.v1 databases into the schema file for a declaring function", async () => {
    await withOutDir(async (dir) => {
      const bundlePath = join(dir, "db-chat.ts");
      const schemaPath = join(dir, "db-chat.schema.json");
      const { stdout, code } = await run([
        "build",
        fx("db-chat.ts"),
        bundlePath,
        schemaPath,
      ]);

      expect(code).toBe(0);
      expect(JSON.parse(stdout)).toEqual({ ok: true });

      const schema = JSON.parse(await readFile(schemaPath, "utf8"));
      expect(schema.databases.version).toBe(1);
      expect(Object.keys(schema.databases.databases)).toEqual(["chat"]);
      const chat = schema.databases.databases.chat;
      expect(chat.schemaFile).toBe("databases/chat.db.ts");
      expect(chat.tables.users.columns.created_at.mode).toBe("timestamp");
      expect(chat.tables.users.indexes.users_handle_idx.unique).toBe(true);
    });
  });

  test("omits databases from the schema file for a non-declaring function", async () => {
    await withOutDir(async (dir) => {
      const schemaPath = join(dir, "greet.schema.json");
      const { code } = await run([
        "build",
        fx("greet.ts"),
        join(dir, "greet.ts"),
        schemaPath,
      ]);
      expect(code).toBe(0);
      const schema = JSON.parse(await readFile(schemaPath, "utf8"));
      expect(schema.databases).toBeUndefined();
    });
  });

  test("exits 1 with database_schema_invalid on a foreign-key schema", async () => {
    await withOutDir(async (dir) => {
      const { stdout, code } = await run([
        "build",
        fx("db-fk.ts"),
        join(dir, "out.ts"),
        join(dir, "out.json"),
      ]);
      expect(code).toBe(1);
      const envelope = JSON.parse(stdout);
      expect(envelope.error.kind).toBe("database_schema_invalid");
      expect(envelope.error.message).toMatch(/foreign keys/);
    });
  });

  test("exits 1 with database_schema_unresolvable on a missing schema file", async () => {
    await withOutDir(async (dir) => {
      const { stdout, code } = await run([
        "build",
        fx("db-missing.ts"),
        join(dir, "out.ts"),
        join(dir, "out.json"),
      ]);
      expect(code).toBe(1);
      expect(JSON.parse(stdout).error.kind).toBe(
        "database_schema_unresolvable"
      );
    });
  });

  test("exits 1 with databases_declaration_invalid on a malformed declaration", async () => {
    await withOutDir(async (dir) => {
      const { stdout, code } = await run([
        "build",
        fx("db-badname.ts"),
        join(dir, "out.ts"),
        join(dir, "out.json"),
      ]);
      expect(code).toBe(1);
      expect(JSON.parse(stdout).error.kind).toBe(
        "databases_declaration_invalid"
      );
    });
  });
});
