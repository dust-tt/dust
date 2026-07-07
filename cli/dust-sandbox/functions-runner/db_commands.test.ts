import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DbCommandError, type DbErrorKind } from "./db_common.ts";
import {
  QUERY_INLINE_PAYLOAD_CAP_BYTES,
  QUERY_INLINE_ROW_CAP,
  queryReadonly,
} from "./db_query.ts";
import { reconcile } from "./db_reconcile.ts";
import { generateSchemaFileText } from "./db_schema.ts";

const fx = (n: string) => join(import.meta.dir, "fixtures", "databases", n);

async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "dsbx-db-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function expectDbError(
  fn: () => Promise<unknown>,
  kind: DbErrorKind,
  messagePattern: RegExp
): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(DbCommandError);
  if (caught instanceof DbCommandError) {
    expect(caught.kind).toBe(kind);
    expect(caught.message).toMatch(messagePattern);
  }
}

function tableNames(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return (
      db
        .query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all() as { name: string }[]
    ).map((row) => row.name);
  } finally {
    db.close();
  }
}

describe("db reconcile", () => {
  test("creates the database on first claim with WAL mode, group-writable, and applies the schema", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      const result = await reconcile(dbPath, fx("chat.db.ts"));

      expect(result.ok).toBe(true);
      expect(result.created).toBe(true);
      expect(result.statements.length).toBeGreaterThan(0);

      // Group-writable per paths-env.v1: litestream (dust-state, group agent) must write the
      // file it replicates; -wal/-shm inherit this mode.
      expect(statSync(dbPath).mode & 0o777).toBe(0o660);

      const db = new Database(dbPath, { readonly: true });
      try {
        const mode = db.query("PRAGMA journal_mode").get() as {
          journal_mode: string;
        };
        expect(mode.journal_mode).toBe("wal");
      } finally {
        db.close();
      }
      expect(tableNames(dbPath)).toEqual(["messages", "settings", "users"]);
    });
  });

  test("a failed first claim leaves no database file behind", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "dup.db");
      await expectDbError(
        () => reconcile(dbPath, fx("dup_index.db.ts")),
        "apply_failed",
        /rolled back/
      );
      for (const suffix of ["", "-wal", "-shm"]) {
        expect(existsSync(`${dbPath}${suffix}`)).toBe(false);
      }
    });
  });

  test("a failed reconcile on an EXISTING database keeps the file", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      await reconcile(dbPath, fx("chat.db.ts"));
      await expectDbError(
        () => reconcile(dbPath, fx("chat_reduced.db.ts")),
        "destructive_change",
        /would be dropped/
      );
      expect(existsSync(dbPath)).toBe(true);
    });
  });

  test("is idempotent: a second reconcile applies nothing", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      await reconcile(dbPath, fx("chat.db.ts"));
      const second = await reconcile(dbPath, fx("chat.db.ts"));

      expect(second.created).toBe(false);
      expect(second.statements).toEqual([]);
    });
  });

  test("applies additive evolution (new column, new index, new table) and keeps data", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      await reconcile(dbPath, fx("chat.db.ts"));

      const db = new Database(dbPath);
      db.exec(
        "INSERT INTO users (handle, created_at) VALUES ('alice', 1700000000)"
      );
      db.close();

      const result = await reconcile(dbPath, fx("chat_v2.db.ts"));
      expect(result.statements.join("\n")).toMatch(/ALTER TABLE .users. ADD/);
      expect(result.statements.join("\n")).toMatch(/CREATE TABLE .reactions./);
      expect(result.statements.join("\n")).toMatch(/users_bio_idx/);

      const after = new Database(dbPath, { readonly: true });
      try {
        const row = after.query("SELECT handle, bio FROM users").get() as {
          handle: string;
          bio: unknown;
        };
        expect(row.handle).toBe("alice");
        expect(row.bio).toBeNull();
      } finally {
        after.close();
      }
    });
  });

  test("refuses destructive changes (dropped column/tables) with a typed error", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      await reconcile(dbPath, fx("chat.db.ts"));

      await expectDbError(
        () => reconcile(dbPath, fx("chat_reduced.db.ts")),
        "destructive_change",
        /display_name.*would be dropped|would be dropped/
      );
      // Nothing was applied.
      expect(tableNames(dbPath)).toEqual(["messages", "settings", "users"]);
    });
  });

  test("refuses a type change (table recreate plan) with a typed error", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "notes.db");
      await reconcile(dbPath, fx("notes.db.ts"));

      await expectDbError(
        () => reconcile(dbPath, fx("notes_typechange.db.ts")),
        "disallowed_statement",
        /additive DDL/
      );

      // The live column type is unchanged.
      const db = new Database(dbPath, { readonly: true });
      try {
        const info = db.query("PRAGMA table_xinfo(notes)").all() as {
          name: string;
          type: string;
        }[];
        const label = info.find((column) => column.name === "label");
        expect(label?.type.toUpperCase()).toContain("TEXT");
      } finally {
        db.close();
      }
    });
  });

  test("refuses a missing schema file with a typed error", async () => {
    await withDir(async (dir) => {
      await expectDbError(
        () => reconcile(join(dir, "chat.db"), join(dir, "nope.db.ts")),
        "schema_unresolvable",
        /schema file not found/
      );
    });
  });

  test("refuses a schema file with foreign keys (same gate as build)", async () => {
    await withDir(async (dir) => {
      await expectDbError(
        () => reconcile(join(dir, "fk.db"), fx("fk.db.ts")),
        "schema_invalid",
        /foreign keys/
      );
    });
  });
});

describe("db schema", () => {
  test("regenerates a schema file that reconciles cleanly against the same database", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      await reconcile(dbPath, fx("chat.db.ts"));

      const text = generateSchemaFileText(dbPath);
      expect(text).toContain('from "drizzle-orm/sqlite-core"');
      expect(text).toContain("export const users = sqliteTable(");
      expect(text).toContain(".primaryKey({ autoIncrement: true })");
      expect(text).toContain('uniqueIndex("users_handle_idx")');
      expect(text).toContain("modes");

      // Roundtrip: the regenerated file must be a no-op plan against the live database. It is
      // written inside the package tree so its `drizzle-orm` import resolves by node_modules
      // walk-up (the sandbox resolves it via NODE_PATH instead).
      const scratch = await mkdtemp(join(import.meta.dir, ".db-test-"));
      try {
        const regenerated = join(scratch, "chat.regenerated.db.ts");
        await writeFile(regenerated, text);
        const roundtrip = await reconcile(dbPath, regenerated);
        expect(roundtrip.statements).toEqual([]);
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    });
  });

  test("errors with database_not_found on a missing database", async () => {
    await withDir(async (dir) => {
      let caught: unknown;
      try {
        generateSchemaFileText(join(dir, "nope.db"));
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(DbCommandError);
      if (caught instanceof DbCommandError) {
        expect(caught.kind).toBe("database_not_found");
      }
    });
  });
});

describe("db query", () => {
  async function seeded(dir: string): Promise<string> {
    const dbPath = join(dir, "chat.db");
    await reconcile(dbPath, fx("chat.db.ts"));
    const db = new Database(dbPath);
    db.exec(
      "INSERT INTO users (handle, created_at) VALUES ('alice', 1), ('bob', 2)"
    );
    db.close();
    return dbPath;
  }

  test("returns rows with columns", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      const result = queryReadonly(
        dbPath,
        "SELECT handle FROM users ORDER BY handle"
      );
      expect(result.ok).toBe(true);
      expect(result.columns).toEqual(["handle"]);
      expect(result.rows).toEqual([{ handle: "alice" }, { handle: "bob" }]);
      expect(result.row_count).toBe(2);
      expect(result.results_file).toBeNull();
      expect(result.note).toBeNull();
    });
  });

  test("spills the complete result set to a file beyond the inline row cap", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "notes.db");
      await reconcile(dbPath, fx("notes.db.ts"));
      const db = new Database(dbPath);
      const insert = db.prepare("INSERT INTO notes (label) VALUES (?)");
      db.exec("BEGIN");
      for (let i = 0; i < QUERY_INLINE_ROW_CAP + 1; i++) {
        insert.run(`row-${i}`);
      }
      db.exec("COMMIT");
      db.close();

      const result = queryReadonly(
        dbPath,
        "SELECT label FROM notes ORDER BY id"
      );
      expect(result.rows.length).toBe(QUERY_INLINE_ROW_CAP);
      expect(result.row_count).toBe(QUERY_INLINE_ROW_CAP + 1);
      expect(result.results_file).not.toBeNull();
      expect(result.note).toContain(result.results_file ?? "");
      if (result.results_file !== null) {
        const lines = readFileSync(result.results_file, "utf8")
          .trimEnd()
          .split("\n");
        // The spill file holds EVERY row, preview included.
        expect(lines.length).toBe(QUERY_INLINE_ROW_CAP + 1);
        expect(JSON.parse(lines[0] ?? "")).toEqual({ label: "row-0" });
        expect(JSON.parse(lines.at(-1) ?? "")).toEqual({
          label: `row-${QUERY_INLINE_ROW_CAP}`,
        });
        await rm(result.results_file, { force: true });
      }
    });
  });

  test("rejects writes (read-only + query_only)", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      let caught: unknown;
      try {
        queryReadonly(
          dbPath,
          "INSERT INTO users (handle, created_at) VALUES ('eve', 3)"
        );
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(DbCommandError);
      if (caught instanceof DbCommandError) {
        expect(caught.kind).toBe("query_failed");
      }
      // Nothing was written.
      const check = queryReadonly(dbPath, "SELECT count(*) AS n FROM users");
      expect(check.rows).toEqual([{ n: 2 }]);
    });
  });

  test("rejects multi-statement SQL (bun:sqlite would silently run only the first)", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      let caught: unknown;
      try {
        queryReadonly(dbPath, "SELECT handle FROM users; DELETE FROM users");
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(DbCommandError);
      if (caught instanceof DbCommandError) {
        expect(caught.kind).toBe("query_failed");
        expect(caught.message).toMatch(/multiple SQL statements/);
      }

      // A trailing semicolon (and semicolons inside string literals) are fine.
      const trailing = queryReadonly(
        dbPath,
        "SELECT count(*) AS n FROM users WHERE handle != 'a;b';"
      );
      expect(trailing.rows).toEqual([{ n: 2 }]);
    });
  });

  test("spills beyond the inline payload bytes, even for a single oversized row", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "notes.db");
      await reconcile(dbPath, fx("notes.db.ts"));
      const db = new Database(dbPath);
      const insert = db.prepare("INSERT INTO notes (label) VALUES (?)");
      // Row one fits inline; row two crosses the byte bound; row three is already spilling.
      insert.run("x".repeat(Math.floor(QUERY_INLINE_PAYLOAD_CAP_BYTES * 0.6)));
      insert.run("x".repeat(Math.floor(QUERY_INLINE_PAYLOAD_CAP_BYTES * 0.6)));
      insert.run("small");
      db.close();

      const result = queryReadonly(
        dbPath,
        "SELECT label FROM notes ORDER BY id"
      );
      expect(result.rows.length).toBe(1);
      expect(result.row_count).toBe(3);
      expect(result.results_file).not.toBeNull();
      if (result.results_file !== null) {
        const lines = readFileSync(result.results_file, "utf8")
          .trimEnd()
          .split("\n");
        expect(lines.length).toBe(3);
        await rm(result.results_file, { force: true });
      }
    });
  });

  test("serializes SQLite's non-JSON value classes: 64-bit integers and blobs", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      const result = queryReadonly(
        dbPath,
        "SELECT 42 AS small, 9007199254740993 AS big, x'41' AS data"
      );
      // Exact integers come back as numbers; beyond 2^53 as decimal strings; blobs as base64.
      expect(result.rows).toEqual([
        { small: 42, big: "9007199254740993", data: "QQ==" },
      ]);
    });
  });

  test("errors on an empty SQL input", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      let caught: unknown;
      try {
        queryReadonly(dbPath, "   \n ");
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(DbCommandError);
      if (caught instanceof DbCommandError) {
        expect(caught.kind).toBe("empty_sql");
      }
    });
  });

  test("errors with database_not_found on a missing database", async () => {
    await withDir(async (dir) => {
      let caught: unknown;
      try {
        queryReadonly(join(dir, "nope.db"), "SELECT 1");
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(DbCommandError);
      if (caught instanceof DbCommandError) {
        expect(caught.kind).toBe("database_not_found");
      }
    });
  });
});

describe("runner db-* envelopes", () => {
  const runner = join(import.meta.dir, "runner.ts");

  async function run(args: string[], stdin?: string) {
    const proc = Bun.spawn(["bun", runner, ...args], {
      stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, code] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    return { stdout, code };
  }

  test("db-reconcile prints a one-line ok envelope", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      const { stdout, code } = await run([
        "db-reconcile",
        dbPath,
        fx("chat.db.ts"),
      ]);
      expect(code).toBe(0);
      const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
      const envelope = JSON.parse(lines.at(-1) ?? "");
      expect(envelope.ok).toBe(true);
      expect(envelope.created).toBe(true);
      // The whole stdout is the envelope: drizzle-kit's spinner is suppressed.
      expect(lines).toHaveLength(1);
    });
  });

  test("db-reconcile prints a typed error envelope and exits 1", async () => {
    await withDir(async (dir) => {
      const { stdout, code } = await run([
        "db-reconcile",
        join(dir, "fk.db"),
        fx("fk.db.ts"),
      ]);
      expect(code).toBe(1);
      const envelope = JSON.parse(stdout.trim().split("\n").at(-1) ?? "");
      expect(envelope.ok).toBe(false);
      expect(envelope.error.kind).toBe("schema_invalid");
    });
  });

  test("db-schema writes the file and prints ok", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      await run(["db-reconcile", dbPath, fx("chat.db.ts")]);
      const outPath = join(dir, "chat.db.ts");
      const { stdout, code } = await run(["db-schema", dbPath, outPath]);
      expect(code).toBe(0);
      expect(JSON.parse(stdout.trim())).toEqual({ ok: true });
      const text = await Bun.file(outPath).text();
      expect(text).toContain("export const users = sqliteTable(");
    });
  });

  test("db-query reads SQL from stdin", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      await run(["db-reconcile", dbPath, fx("chat.db.ts")]);
      const { stdout, code } = await run(
        ["db-query", dbPath],
        "SELECT count(*) AS n FROM users"
      );
      expect(code).toBe(0);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.ok).toBe(true);
      expect(envelope.rows).toEqual([{ n: 0 }]);
    });
  });

  test("db-* subcommands exit 2 with bad_args on missing arguments", async () => {
    for (const args of [
      ["db-reconcile"],
      ["db-schema", "/tmp/x.db"],
      ["db-query"],
    ]) {
      const { stdout, code } = await run(args);
      expect(code).toBe(2);
      expect(JSON.parse(stdout.trim()).error.kind).toBe("bad_args");
    }
  });
});
