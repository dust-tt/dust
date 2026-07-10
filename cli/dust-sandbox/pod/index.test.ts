import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  db,
  POD_DATABASE_BUSY_TIMEOUT_MS,
  POD_DATABASE_MAX_SIZE_BYTES_ENV,
  POD_DATABASES_DIR_ENV,
  POD_SPACE_ID_ENV,
  PodDatabaseError,
  PodDatabaseFullError,
  PodDatabaseInvalidNameError,
  PodDatabaseNotDeclaredError,
  PodDatabasesUnavailableError,
} from "@dust/pod";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The production quota front passes per exec.
const ONE_GIB_BYTES = 1024 * 1024 * 1024;

const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
});

const blobs = sqliteTable("blobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  data: blob("data", { mode: "buffer" }),
});

let databasesDir: string;

// Simulate `dsbx db reconcile` creating a database: WAL + DDL, then close.
function createDatabaseFile(name: string, ...ddl: string[]): string {
  const path = join(databasesDir, `${name}.db`);
  const sqlite = new Database(path, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL");
  for (const statement of ddl) {
    sqlite.exec(statement);
  }
  sqlite.close();
  return path;
}

// Each test gets a unique database name: db() caches instances per resolved
// path for the process lifetime, and temp dirs make paths unique anyway.
let uniqueNameCounter = 0;
function uniqueName(prefix: string): string {
  uniqueNameCounter += 1;
  return `${prefix}_${uniqueNameCounter}`;
}

let originalSpaceId: string | undefined;

beforeEach(() => {
  databasesDir = mkdtempSync(join(tmpdir(), "dust-pod-test-"));
  process.env[POD_DATABASES_DIR_ENV] = databasesDir;
  // Both env vars are required and normally set by front through dsbx.
  process.env[POD_DATABASE_MAX_SIZE_BYTES_ENV] = String(ONE_GIB_BYTES);
  // Pod sandboxes carry SPACE_ID as a sandbox-global env var.
  originalSpaceId = process.env[POD_SPACE_ID_ENV];
  process.env[POD_SPACE_ID_ENV] = "spc_test_pod";
});

afterEach(() => {
  delete process.env[POD_DATABASES_DIR_ENV];
  delete process.env[POD_DATABASE_MAX_SIZE_BYTES_ENV];
  if (originalSpaceId === undefined) {
    delete process.env[POD_SPACE_ID_ENV];
  } else {
    process.env[POD_SPACE_ID_ENV] = originalSpaceId;
  }
  rmSync(databasesDir, { recursive: true, force: true });
});

describe("pod sandbox guard", () => {
  test("SPACE_ID absent throws PodDatabasesUnavailableError even when the file exists", () => {
    const name = uniqueName("guard");
    createDatabaseFile(name);
    delete process.env[POD_SPACE_ID_ENV];
    expect(() => db(name)).toThrow(PodDatabasesUnavailableError);
    expect(() => db(name)).toThrow(/does not belong to a pod/);
  });

  test("empty SPACE_ID is treated as absent", () => {
    const name = uniqueName("guard");
    createDatabaseFile(name);
    process.env[POD_SPACE_ID_ENV] = "";
    expect(() => db(name)).toThrow(PodDatabasesUnavailableError);
  });

  test("the guard runs before the missing-file check", () => {
    delete process.env[POD_SPACE_ID_ENV];
    expect(() => db(uniqueName("guard"))).toThrow(PodDatabasesUnavailableError);
  });
});

describe("name validation", () => {
  test("accepts contract-conforming names", () => {
    for (const name of ["chat", "a", "a1", "a_b_c", `a${"b".repeat(63)}`]) {
      createDatabaseFile(name);
      expect(() => db(name)).not.toThrow();
    }
  });

  test("rejects invalid names with PodDatabaseInvalidNameError", () => {
    const invalid = [
      "",
      "Chat",
      "1chat",
      "_chat",
      "chat-log",
      "chat.db",
      "a/b",
      "../escape",
      `a${"b".repeat(64)}`, // 65 chars
    ];
    for (const name of invalid) {
      expect(() => db(name)).toThrow(PodDatabaseInvalidNameError);
    }
  });

  test("validates the name before touching the filesystem", () => {
    delete process.env[POD_DATABASES_DIR_ENV];
    expect(() => db("NOT_VALID")).toThrow(PodDatabaseInvalidNameError);
  });
});

describe("must-exist open", () => {
  test("missing database file throws PodDatabaseNotDeclaredError", () => {
    const name = uniqueName("missing");
    expect(() => db(name)).toThrow(PodDatabaseNotDeclaredError);
  });

  test("the error tells the agent databases are created by publish", () => {
    const name = uniqueName("missing");
    expect(() => db(name)).toThrow(/created by their first reconcile/);
    expect(() => db(name)).toThrow(new RegExp(`databases/${name}\\.db\\.ts`));
  });

  test("a failed open does not mint an empty database file", () => {
    const name = uniqueName("missing");
    expect(() => db(name)).toThrow(PodDatabaseNotDeclaredError);
    expect(existsSync(join(databasesDir, `${name}.db`))).toBe(false);
  });

  test("throws when the databases dir env var is absent", () => {
    // No fallback path lives here: front owns the location and passes it
    // through dsbx. Unset means a broken launch context, not an empty pod.
    delete process.env[POD_DATABASES_DIR_ENV];
    const name = uniqueName("nodir");
    expect(() => db(name)).toThrow(PodDatabaseError);
    expect(() => db(name)).toThrow(/DUST_POD_DATABASES_DIR is not set/);
  });

  test("an empty databases dir env var is treated as absent", () => {
    // dsbx passes env through verbatim; empty means the same broken launch
    // context as unset, and this is the one layer that normalizes it.
    process.env[POD_DATABASES_DIR_ENV] = "";
    const name = uniqueName("nodir");
    expect(() => db(name)).toThrow(PodDatabaseError);
    expect(() => db(name)).toThrow(/DUST_POD_DATABASES_DIR is not set/);
  });
});

describe("queries through drizzle", () => {
  test("insert and select round-trip, modes applied", () => {
    const name = uniqueName("chat");
    createDatabaseFile(
      name,
      "CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, created_at INTEGER)"
    );

    const handle = db(name);
    const createdAt = new Date(1700000000000);
    handle.insert(messages).values({ body: "hello", createdAt }).run();
    handle.insert(messages).values({ body: "world", createdAt: null }).run();

    const rows = handle.select().from(messages).all();
    expect(rows.length).toBe(2);
    expect(rows[0]?.body).toBe("hello");
    expect(rows[0]?.createdAt).toEqual(createdAt);
    expect(rows[1]?.createdAt).toBeNull();
  });

  test("writes are durable across instances (readwrite open)", () => {
    const name = uniqueName("chat");
    const path = createDatabaseFile(
      name,
      "CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, created_at INTEGER)"
    );
    db(name).insert(messages).values({ body: "persisted" }).run();

    const raw = new Database(path, { readonly: true });
    const row = raw
      .query<{ body: string }, []>("SELECT body FROM messages")
      .get();
    raw.close();
    expect(row?.body).toBe("persisted");
  });

  test("non-quota SQLite errors pass through untranslated", () => {
    const name = uniqueName("chat");
    createDatabaseFile(
      name,
      "CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, created_at INTEGER)"
    );
    let thrown: unknown;
    try {
      // NOT NULL violation on body.
      db(name).$client.exec("INSERT INTO messages (body) VALUES (NULL)");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(PodDatabaseError);
  });
});

describe("pragmas", () => {
  test("busy_timeout, synchronous, wal_autocheckpoint and max_page_count are applied", () => {
    const name = uniqueName("pragmas");
    createDatabaseFile(name);

    const client = db(name).$client;
    const pragma = <T>(sql: string): T | null => client.query<T, []>(sql).get();

    expect(pragma<{ timeout: number }>("PRAGMA busy_timeout")?.timeout).toBe(
      POD_DATABASE_BUSY_TIMEOUT_MS
    );
    // 1 = NORMAL.
    expect(
      pragma<{ synchronous: number }>("PRAGMA synchronous")?.synchronous
    ).toBe(1);
    expect(
      pragma<{ wal_autocheckpoint: number }>("PRAGMA wal_autocheckpoint")
        ?.wal_autocheckpoint
    ).toBe(0);

    const pageSize = pragma<{ page_size: number }>("PRAGMA page_size");
    expect(pageSize).not.toBeNull();
    const expectedPages = Math.floor(
      ONE_GIB_BYTES / (pageSize?.page_size ?? 0)
    );
    expect(
      pragma<{ max_page_count: number }>("PRAGMA max_page_count")
        ?.max_page_count
    ).toBe(expectedPages);
  });

  test("the quota env var drives max_page_count", () => {
    const name = uniqueName("quota");
    createDatabaseFile(name);
    process.env[POD_DATABASE_MAX_SIZE_BYTES_ENV] = "20480"; // 5 pages of 4096.

    const client = db(name).$client;
    expect(
      client
        .query<{ max_page_count: number }, []>("PRAGMA max_page_count")
        .get()?.max_page_count
    ).toBe(5);
  });

  test("quotas above 1 GiB are honored, not clamped", () => {
    const name = uniqueName("quota");
    createDatabaseFile(name);
    process.env[POD_DATABASE_MAX_SIZE_BYTES_ENV] = String(2 * ONE_GIB_BYTES);

    const client = db(name).$client;
    const pageSize = client
      .query<{ page_size: number }, []>("PRAGMA page_size")
      .get();
    expect(pageSize).not.toBeNull();
    expect(
      client
        .query<{ max_page_count: number }, []>("PRAGMA max_page_count")
        .get()?.max_page_count
    ).toBe(Math.floor((2 * ONE_GIB_BYTES) / (pageSize?.page_size ?? 0)));
  });

  test("throws when the quota env var is absent", () => {
    // No default lives here: front owns the quota and passes it through dsbx.
    const name = uniqueName("quota");
    createDatabaseFile(name);
    delete process.env[POD_DATABASE_MAX_SIZE_BYTES_ENV];
    expect(() => db(name)).toThrow(PodDatabaseError);
    expect(() => db(name)).toThrow(
      /DUST_POD_DATABASE_MAX_SIZE_BYTES is not set/
    );
  });

  test("throws when the quota env var is not a positive integer", () => {
    const name = uniqueName("quota");
    createDatabaseFile(name);
    // Canonical decimal digits only: Number() alone would accept "1e3",
    // "0x10" or " 42 ".
    const invalid = ["0", "-1", "1.5", "abc", "1e100", "1e3", "0x10", " 42 "];
    for (const raw of invalid) {
      process.env[POD_DATABASE_MAX_SIZE_BYTES_ENV] = raw;
      expect(() => db(name)).toThrow(/not a positive integer byte count/);
    }
  });
});

describe("instance caching", () => {
  test("db(name) returns the same instance for the same database", () => {
    const name = uniqueName("cached");
    createDatabaseFile(name);
    expect(db(name)).toBe(db(name));
  });

  test("different databases get different instances", () => {
    const a = uniqueName("cached");
    const b = uniqueName("cached");
    createDatabaseFile(a);
    createDatabaseFile(b);
    expect(db(a)).not.toBe(db(b));
  });
});

describe("size quota enforcement", () => {
  test("writes past the quota throw PodDatabaseFullError", () => {
    const name = uniqueName("full");
    createDatabaseFile(
      name,
      "CREATE TABLE blobs (id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB)"
    );
    process.env[POD_DATABASE_MAX_SIZE_BYTES_ENV] = "20480"; // 5 pages of 4096.

    const handle = db(name);
    let thrown: unknown;
    try {
      // Each row carries a page-sized payload; 5 pages fill up fast. The loop
      // bound only guards against the quota silently not applying.
      for (let i = 0; i < 1000; i++) {
        handle
          .insert(blobs)
          .values({ data: Buffer.alloc(4096, 1) })
          .run();
      }
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PodDatabaseFullError);
    expect(thrown).toBeInstanceOf(PodDatabaseError);
    if (thrown instanceof PodDatabaseFullError) {
      expect(thrown.message).toContain(`"${name}" is full`);
      expect(thrown.message).toContain("20480");
    }
  });
});
