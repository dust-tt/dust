import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Result } from "#result.ts";
import type { DbErrorKind } from "#types/db.ts";
import { DbCommandError, POD_DATABASE_MAX_SIZE_BYTES_ENV } from "./common.ts";
import { QUERY_PAYLOAD_CAP_BYTES, QUERY_ROW_CAP, runQuery } from "./query.ts";
import { reconcile } from "./reconcile.ts";

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

describe("db query", () => {
  async function seeded(dir: string): Promise<string> {
    const dbPath = join(dir, "chat.db");
    unwrap(await reconcile(dbPath, fx("chat.db.ts")));
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
      const result = unwrap(
        runQuery(dbPath, "SELECT handle FROM users ORDER BY handle")
      );
      expect(result.columns).toEqual(["handle"]);
      expect(result.rows).toEqual([{ handle: "alice" }, { handle: "bob" }]);
      expect(result.truncated).toBe(false);
      expect(result.note).toBeNull();
    });
  });

  test("truncates past the row cap and says so", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "notes.db");
      unwrap(await reconcile(dbPath, fx("notes.db.ts")));
      const db = new Database(dbPath);
      const insert = db.prepare("INSERT INTO notes (label) VALUES (?)");
      db.exec("BEGIN");
      for (let i = 0; i < QUERY_ROW_CAP + 1; i++) {
        insert.run(`row-${i}`);
      }
      db.exec("COMMIT");
      db.close();

      const result = unwrap(
        runQuery(dbPath, "SELECT label FROM notes ORDER BY id")
      );
      expect(result.rows.length).toBe(QUERY_ROW_CAP);
      expect(result.rows[0]).toEqual({ label: "row-0" });
      expect(result.rows.at(-1)).toEqual({ label: `row-${QUERY_ROW_CAP - 1}` });
      expect(result.truncated).toBe(true);
      expect(result.note).toContain(`first ${QUERY_ROW_CAP} rows`);
    });
  });

  test("a result of exactly the row cap is not truncated", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "notes.db");
      unwrap(await reconcile(dbPath, fx("notes.db.ts")));
      const db = new Database(dbPath);
      const insert = db.prepare("INSERT INTO notes (label) VALUES (?)");
      db.exec("BEGIN");
      for (let i = 0; i < QUERY_ROW_CAP; i++) {
        insert.run(`row-${i}`);
      }
      db.exec("COMMIT");
      db.close();

      const result = unwrap(runQuery(dbPath, "SELECT label FROM notes"));
      expect(result.rows.length).toBe(QUERY_ROW_CAP);
      expect(result.truncated).toBe(false);
      expect(result.note).toBeNull();
    });
  });

  test("a truncated RETURNING result still commits the write", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "notes.db");
      unwrap(await reconcile(dbPath, fx("notes.db.ts")));
      const values = Array.from(
        { length: QUERY_ROW_CAP + 1 },
        (_, i) => `('row-${i}')`
      ).join(", ");

      const result = unwrap(
        runQuery(
          dbPath,
          `INSERT INTO notes (label) VALUES ${values} RETURNING label`
        )
      );
      expect(result.rows.length).toBe(QUERY_ROW_CAP);
      expect(result.truncated).toBe(true);

      const check = unwrap(runQuery(dbPath, "SELECT count(*) AS n FROM notes"));
      expect(check.rows).toEqual([{ n: QUERY_ROW_CAP + 1 }]);
    });
  });

  test("runs DML and reports the affected rows", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);

      const insert = unwrap(
        runQuery(
          dbPath,
          "INSERT INTO users (handle, created_at) VALUES ('eve', 3)"
        )
      );
      expect(insert.changes).toBe(1);
      expect(insert.rows).toEqual([]);
      expect(insert.truncated).toBe(false);

      const update = unwrap(
        runQuery(
          dbPath,
          "UPDATE users SET created_at = 9 WHERE handle != 'eve'"
        )
      );
      expect(update.changes).toBe(2);

      const check = unwrap(runQuery(dbPath, "SELECT count(*) AS n FROM users"));
      expect(check.rows).toEqual([{ n: 3 }]);
      expect(check.changes).toBeNull();
    });
  });

  test("returns RETURNING rows from DML", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      const result = unwrap(
        runQuery(
          dbPath,
          "DELETE FROM users WHERE handle = 'alice' RETURNING handle"
        )
      );
      expect(result.rows).toEqual([{ handle: "alice" }]);
      expect(result.truncated).toBe(false);
    });
  });

  test("rolls back a failed DML statement", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      // handle is NOT NULL: the statement fails after the transaction opened.
      await expectDbError(
        () => runQuery(dbPath, "INSERT INTO users (created_at) VALUES (3)"),
        "query_failed",
        /NOT NULL/i
      );
      const check = unwrap(runQuery(dbPath, "SELECT count(*) AS n FROM users"));
      expect(check.rows).toEqual([{ n: 2 }]);
    });
  });

  test("a write past the size quota fails with database_full", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      // maxSizeBytes = 1 caps growth at the current page count; the 200 KB row needs new pages.
      const big = "x".repeat(200_000);
      await expectDbError(
        () =>
          runQuery(
            dbPath,
            `INSERT INTO users (handle, created_at) VALUES ('${big}', 3)`,
            1
          ),
        "database_full",
        /size quota/
      );
      const check = unwrap(runQuery(dbPath, "SELECT count(*) AS n FROM users"));
      expect(check.rows).toEqual([{ n: 2 }]);
    });
  });

  test("refuses DDL by rolling back any schema change", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      for (const sql of [
        "CREATE TABLE sneaky (id INTEGER)",
        "DROP TABLE users",
        "ALTER TABLE users ADD sneaky TEXT",
      ]) {
        await expectDbError(
          () => runQuery(dbPath, sql),
          "disallowed_statement",
          /changed the database schema/
        );
      }
      expect(tableNames(dbPath)).toEqual(["messages", "settings", "users"]);
    });
  });

  // VACUUM, BEGIN and PRAGMA journal_mode all error "...within a transaction" because every
  // statement runs inside BEGIN IMMEDIATE — that wrapper, not a keyword gate, is what keeps a
  // query from checkpointing away the WAL or nesting a transaction.
  test("statements that can't run in a transaction fail, leaving schema and WAL intact", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      for (const sql of ["VACUUM", "BEGIN", "PRAGMA journal_mode = DELETE"]) {
        await expectDbError(
          () => runQuery(dbPath, sql),
          "query_failed",
          /transaction/i
        );
      }
      expect(tableNames(dbPath)).toEqual(["messages", "settings", "users"]);
      expect(journalMode(dbPath)).toBe("wal");
    });
  });

  test("rejects multi-statement SQL (bun:sqlite would silently run only the first)", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      await expectDbError(
        () => runQuery(dbPath, "SELECT handle FROM users; DELETE FROM users"),
        "query_failed",
        /multiple SQL statements/
      );

      // A trailing semicolon (and semicolons inside string literals) are fine.
      const trailing = unwrap(
        runQuery(
          dbPath,
          "SELECT count(*) AS n FROM users WHERE handle != 'a;b';"
        )
      );
      expect(trailing.rows).toEqual([{ n: 2 }]);
    });
  });

  // ATTACH is not keyword-blocked (SQLite allows it inside a transaction), but it can't reach
  // another database: a lone ATTACH detaches when the connection closes, and pairing it with a
  // query that reads the attached db trips the single-statement guard before the ATTACH runs.
  test("ATTACH cannot reach another database — the follow-up statement is rejected", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      await expectDbError(
        () =>
          runQuery(
            dbPath,
            "ATTACH DATABASE '/tmp/other.db' AS other; SELECT * FROM other.secret"
          ),
        "query_failed",
        /multiple SQL statements/
      );
    });
  });

  test("rejects bound parameters", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      await expectDbError(
        () => runQuery(dbPath, "SELECT handle FROM users WHERE handle = ?"),
        "query_failed",
        /parameters are not supported/
      );
    });
  });

  test("truncates past the payload cap and never skips a row", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "notes.db");
      unwrap(await reconcile(dbPath, fx("notes.db.ts")));
      const db = new Database(dbPath);
      const insert = db.prepare("INSERT INTO notes (label) VALUES (?)");
      // Row one fits; row two crosses the byte cap; row three would fit but comes after the cut.
      insert.run("x".repeat(Math.floor(QUERY_PAYLOAD_CAP_BYTES * 0.6)));
      insert.run("x".repeat(Math.floor(QUERY_PAYLOAD_CAP_BYTES * 0.6)));
      insert.run("small");
      db.close();

      const result = unwrap(
        runQuery(dbPath, "SELECT label FROM notes ORDER BY id")
      );
      expect(result.rows.length).toBe(1);
      expect(result.truncated).toBe(true);
      expect(result.note).toContain("shorter columns");
    });
  });

  test("a single row over the payload cap yields no rows but is flagged", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "notes.db");
      unwrap(await reconcile(dbPath, fx("notes.db.ts")));
      const db = new Database(dbPath);
      db.prepare("INSERT INTO notes (label) VALUES (?)").run(
        "x".repeat(QUERY_PAYLOAD_CAP_BYTES + 1)
      );
      db.close();

      const result = unwrap(runQuery(dbPath, "SELECT label FROM notes"));
      expect(result.rows).toEqual([]);
      expect(result.truncated).toBe(true);
    });
  });

  test("serializes SQLite's non-JSON value classes: 64-bit integers and blobs", async () => {
    await withDir(async (dir) => {
      const dbPath = await seeded(dir);
      const result = unwrap(
        runQuery(
          dbPath,
          "SELECT 42 AS small, 9007199254740993 AS big, x'41' AS data"
        )
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
      await expectDbError(
        () => runQuery(dbPath, "   \n "),
        "empty_sql",
        /no SQL statement/
      );
    });
  });

  test("errors with database_not_found on a missing database", async () => {
    await withDir(async (dir) => {
      await expectDbError(
        () => runQuery(join(dir, "nope.db"), "SELECT 1"),
        "database_not_found",
        /no database at/
      );
    });
  });
});

describe("runner db-query envelope", () => {
  const runner = join(import.meta.dir, "..", "runner.ts");

  async function run(
    args: string[],
    stdin?: string,
    env?: Record<string, string>
  ) {
    const proc = Bun.spawn(["bun", runner, ...args], {
      stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
      stdout: "pipe",
      stderr: "pipe",
      // Bun.spawn replaces the environment; carry the parent env and default the quota.
      env: {
        ...process.env,
        [POD_DATABASE_MAX_SIZE_BYTES_ENV]: String(1024 * 1024 * 1024),
        ...env,
      },
    });
    const [stdout, code] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    return { stdout, code };
  }

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

  test("db-query exits 2 with bad_args on missing arguments", async () => {
    const { stdout, code } = await run(["db-query"]);
    expect(code).toBe(2);
    expect(JSON.parse(stdout.trim()).error.kind).toBe("bad_args");
  });

  test("db-query errors when the size quota env is missing", async () => {
    await withDir(async (dir) => {
      const dbPath = join(dir, "chat.db");
      await run(["db-reconcile", dbPath, fx("chat.db.ts")]);
      const { stdout, code } = await run(["db-query", dbPath], "SELECT 1", {
        [POD_DATABASE_MAX_SIZE_BYTES_ENV]: "",
      });
      expect(code).toBe(1);
      const envelope = JSON.parse(stdout.trim());
      expect(envelope.error.kind).toBe("internal");
      expect(envelope.error.message).toMatch(/positive integer byte count/);
    });
  });
});
