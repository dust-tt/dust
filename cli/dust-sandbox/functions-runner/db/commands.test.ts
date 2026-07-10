import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "../result.ts";
import type { DbErrorKind } from "../types/db.ts";
import { DbCommandError } from "./common.ts";
import { reconcile } from "./reconcile.ts";
import { generateSchemaFileText } from "./schema.ts";

const fx = (n: string) =>
  join(import.meta.dir, "..", "fixtures", "databases", n);

async function withDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "dsbx-db-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function expectDbError(
  fn: () =>
    | Result<unknown, DbCommandError>
    | Promise<Result<unknown, DbCommandError>>,
  kind: DbErrorKind,
  messagePattern: RegExp
): Promise<void> {
  const result = await fn();
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error).toBeInstanceOf(DbCommandError);
    expect(result.error.kind).toBe(kind);
    expect(result.error.message).toMatch(messagePattern);
  }
}

function unwrap<T>(result: Result<T, DbCommandError>): T {
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

function tableNames(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map((row) => row.name);
  } finally {
    db.close();
  }
}

function journalMode(dbPath: string): string {
  const db = new Database(dbPath, { readonly: true });
  try {
    return (
      db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()
        ?.journal_mode ?? ""
    );
  } finally {
    db.close();
  }
}

function columnNames(dbPath: string, table: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .query<{ name: string }, []>(`PRAGMA table_xinfo(${table})`)
      .all()
      .map((column) => column.name);
  } finally {
    db.close();
  }
}

describe("db reconcile", () => {
  test("creates the database on first claim with WAL mode, group-writable, and applies the schema", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      const result = unwrap(await reconcile(dbPath, fx("chat.db.ts")));

      expect(result.created).toBe(true);
      expect(result.statements.length).toBeGreaterThan(0);

      // Group-writable so litestream (dust-state, group agent) can write the file it
      // replicates; -wal/-shm inherit this mode.
      expect(statSync(dbPath).mode & 0o777).toBe(0o660);

      expect(journalMode(dbPath)).toBe("wal");
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
      unwrap(await reconcile(dbPath, fx("chat.db.ts")));
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
      unwrap(await reconcile(dbPath, fx("chat.db.ts")));
      const second = unwrap(await reconcile(dbPath, fx("chat.db.ts")));

      expect(second.created).toBe(false);
      expect(second.statements).toEqual([]);
    });
  });

  test("applies additive evolution (new column, new index, new table) and keeps data", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      unwrap(await reconcile(dbPath, fx("chat.db.ts")));

      const db = new Database(dbPath);
      db.exec(
        "INSERT INTO users (handle, created_at) VALUES ('alice', 1700000000)"
      );
      db.close();

      const result = unwrap(await reconcile(dbPath, fx("chat_v2.db.ts")));
      expect(result.statements.join("\n")).toMatch(/ALTER TABLE .users. ADD/);
      expect(result.statements.join("\n")).toMatch(/CREATE TABLE .reactions./);
      expect(result.statements.join("\n")).toMatch(/users_bio_idx/);

      const after = new Database(dbPath, { readonly: true });
      try {
        const row = after
          .query<{ handle: string; bio: unknown }, []>(
            "SELECT handle, bio FROM users"
          )
          .get();
        expect(row?.handle).toBe("alice");
        expect(row?.bio).toBeNull();
      } finally {
        after.close();
      }
    });
  });

  test("refuses destructive changes (dropped column/tables) with a typed error", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      unwrap(await reconcile(dbPath, fx("chat.db.ts")));

      await expectDbError(
        () => reconcile(dbPath, fx("chat_reduced.db.ts")),
        "destructive_change",
        /display_name.*would be dropped|would be dropped/
      );
      // Nothing was applied.
      expect(tableNames(dbPath)).toEqual(["messages", "settings", "users"]);
    });
  });

  test("refuses adding a NOT NULL column without a default to an existing table", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      unwrap(await reconcile(dbPath, fx("chat.db.ts")));

      // SQLite would refuse the ALTER at apply time; reconcile refuses it up front with a
      // correctable error instead.
      await expectDbError(
        () => reconcile(dbPath, fx("chat_notnull_add.db.ts")),
        "disallowed_statement",
        /NOT NULL column without a default/
      );

      // Nothing was applied.
      expect(columnNames(dbPath, "users")).not.toContain("email");
    });
  });

  test("refuses a type change (table recreate plan) with a typed error", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "notes.db");
      unwrap(await reconcile(dbPath, fx("notes.db.ts")));

      await expectDbError(
        () => reconcile(dbPath, fx("notes_typechange.db.ts")),
        "disallowed_statement",
        /additive DDL/
      );

      // The live column type is unchanged.
      const db = new Database(dbPath, { readonly: true });
      try {
        const info = db
          .query<{ name: string; type: string }, []>(
            "PRAGMA table_xinfo(notes)"
          )
          .all();
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
  test("pulls a drizzle schema file from the live database via drizzle-kit pull", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      // Seed with raw DDL: schema introspection stands on its own, independent of reconcile.
      const db = new Database(dbPath, { create: true });
      db.exec(
        "CREATE TABLE users (" +
          "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
          "handle TEXT NOT NULL, " +
          "nickname TEXT DEFAULT 'anon'" +
          "); " +
          "CREATE UNIQUE INDEX users_handle_idx ON users (handle);"
      );
      db.close();

      // We return drizzle-kit's own pull output verbatim, under a header note.
      const text = unwrap(generateSchemaFileText(dbPath));
      expect(text).toContain('from "drizzle-orm/sqlite-core"');
      expect(text).toContain("export const users = sqliteTable(");
      expect(text).toContain(".primaryKey({ autoIncrement: true })");
      expect(text).toContain('uniqueIndex("users_handle_idx")');
      expect(text).toContain('.default("anon")');
      // SQLite does not store column modes; the header records that they are dropped.
      expect(text).toContain("modes");
    });
  });

  test("errors with database_not_found on a missing database", async () => {
    await withDir(async (dir) => {
      await expectDbError(
        () => generateSchemaFileText(join(dir, "nope.db")),
        "database_not_found",
        /cannot open database/
      );
    });
  });
});

describe("runner db-* envelopes", () => {
  const runner = join(import.meta.dir, "..", "runner.ts");

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

  test("db-* subcommands exit 2 with bad_args on missing arguments", async () => {
    for (const args of [["db-reconcile"], ["db-schema", "/tmp/x.db"]]) {
      const { stdout, code } = await run(args);
      expect(code).toBe(2);
      expect(JSON.parse(stdout.trim()).error.kind).toBe("bad_args");
    }
  });
});
