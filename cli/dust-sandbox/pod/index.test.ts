import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PodDatabase, SandboxDatabase } from "@dust/sandbox";
import {
  db,
  FRAME_ID_ENV,
  FRAME_PUBLICATION_DESCRIPTOR_PATH_ENV,
  FrameDatabaseNotDeclaredError,
  FrameDatabaseUnavailableError,
  FramePublicationDescriptorError,
  POD_DATABASE_BUSY_TIMEOUT_MS,
  POD_DATABASE_MAX_SIZE_BYTES_ENV,
  POD_DATABASE_NAME_REGEX,
  POD_DATABASE_PREFIX_ENV,
  POD_DATABASES_DIR_ENV,
  POD_SPACE_ID_ENV,
  PodDatabaseError,
  PodDatabaseFullError,
  PodDatabaseInvalidNameError,
  PodDatabaseNotDeclaredError,
  PodDatabasesUnavailableError,
  runWithInvocationEnv,
  SANDBOX_DATABASE_BUSY_TIMEOUT_MS,
  SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV,
  SANDBOX_DATABASE_NAME_REGEX,
  SANDBOX_DATABASE_PREFIX_ENV,
  SANDBOX_DATABASES_DIR_ENV,
  SandboxDatabaseError,
  SandboxDatabaseFullError,
  SandboxDatabaseInvalidNameError,
  SandboxDatabasesUnavailableError,
  SUPPORTED_FRAME_PUBLICATION_SCHEMA_VERSION,
} from "@dust/sandbox";
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

function createFramePublicationDescriptor(
  databaseNames: string[],
  schemaVersion = SUPPORTED_FRAME_PUBLICATION_SCHEMA_VERSION
): string {
  const descriptorPath = join(
    databasesDir,
    `${uniqueName("publication")}.json`
  );
  writeFileSync(
    descriptorPath,
    JSON.stringify({
      schemaVersion,
      manifest: {
        databases: databaseNames.map((name) => ({ name })),
      },
    })
  );
  return descriptorPath;
}

let originalSpaceId: string | undefined;
let originalFrameId: string | undefined;
let originalFramePublicationDescriptorPath: string | undefined;

beforeEach(() => {
  databasesDir = mkdtempSync(join(tmpdir(), "dust-pod-test-"));
  process.env[SANDBOX_DATABASES_DIR_ENV] = databasesDir;
  // Both env vars are required and normally set by front through dsbx.
  process.env[SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV] = String(ONE_GIB_BYTES);
  // Pod sandboxes carry SPACE_ID as a sandbox-global env var.
  originalSpaceId = process.env[POD_SPACE_ID_ENV];
  process.env[POD_SPACE_ID_ENV] = "spc_test_pod";
  originalFrameId = process.env[FRAME_ID_ENV];
  delete process.env[FRAME_ID_ENV];
  originalFramePublicationDescriptorPath =
    process.env[FRAME_PUBLICATION_DESCRIPTOR_PATH_ENV];
  delete process.env[FRAME_PUBLICATION_DESCRIPTOR_PATH_ENV];
});

afterEach(() => {
  delete process.env[SANDBOX_DATABASES_DIR_ENV];
  delete process.env[SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV];
  delete process.env[POD_DATABASES_DIR_ENV];
  delete process.env[POD_DATABASE_MAX_SIZE_BYTES_ENV];
  delete process.env[SANDBOX_DATABASE_PREFIX_ENV];
  delete process.env[POD_DATABASE_PREFIX_ENV];
  if (originalSpaceId === undefined) {
    delete process.env[POD_SPACE_ID_ENV];
  } else {
    process.env[POD_SPACE_ID_ENV] = originalSpaceId;
  }
  if (originalFrameId === undefined) {
    delete process.env[FRAME_ID_ENV];
  } else {
    process.env[FRAME_ID_ENV] = originalFrameId;
  }
  if (originalFramePublicationDescriptorPath === undefined) {
    delete process.env[FRAME_PUBLICATION_DESCRIPTOR_PATH_ENV];
  } else {
    process.env[FRAME_PUBLICATION_DESCRIPTOR_PATH_ENV] =
      originalFramePublicationDescriptorPath;
  }
  rmSync(databasesDir, { recursive: true, force: true });
});

describe("legacy database compatibility aliases", () => {
  test("legacy environment keys remain exported", () => {
    expect(SANDBOX_DATABASES_DIR_ENV).toBe("DUST_SANDBOX_DATABASES_DIR");
    expect(POD_DATABASES_DIR_ENV).toBe("DUST_POD_DATABASES_DIR");
    expect(SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV).toBe(
      "DUST_SANDBOX_DATABASE_MAX_SIZE_BYTES"
    );
    expect(POD_DATABASE_MAX_SIZE_BYTES_ENV).toBe(
      "DUST_POD_DATABASE_MAX_SIZE_BYTES"
    );
    expect(POD_DATABASE_BUSY_TIMEOUT_MS).toBe(SANDBOX_DATABASE_BUSY_TIMEOUT_MS);
    expect(POD_DATABASE_NAME_REGEX).toBe(SANDBOX_DATABASE_NAME_REGEX);
    expect(POD_DATABASE_PREFIX_ENV).toBe("DUST_POD_DATABASE_PREFIX");
    expect(SANDBOX_DATABASE_PREFIX_ENV).toBe("DUST_SANDBOX_DATABASE_PREFIX");
  });

  test("error aliases preserve constructor and instanceof behavior", () => {
    expect(PodDatabaseError).toBe(SandboxDatabaseError);
    expect(PodDatabaseInvalidNameError).toBe(SandboxDatabaseInvalidNameError);
    expect(PodDatabasesUnavailableError).toBe(SandboxDatabasesUnavailableError);
    expect(PodDatabaseFullError).toBe(SandboxDatabaseFullError);

    expect(new PodDatabaseError("test")).toBeInstanceOf(SandboxDatabaseError);
    expect(new SandboxDatabaseInvalidNameError("invalid")).toBeInstanceOf(
      PodDatabaseInvalidNameError
    );
    expect(new SandboxDatabasesUnavailableError()).toBeInstanceOf(
      PodDatabasesUnavailableError
    );
    expect(new SandboxDatabaseFullError("test", 1)).toBeInstanceOf(
      PodDatabaseFullError
    );

    // Error.name is part of the legacy compatibility ABI, including when the
    // same constructor is reached through its canonical export.
    expect(new SandboxDatabaseError("test").name).toBe("PodDatabaseError");
    expect(new SandboxDatabaseInvalidNameError("invalid").name).toBe(
      "PodDatabaseInvalidNameError"
    );
    expect(new SandboxDatabasesUnavailableError().name).toBe(
      "PodDatabasesUnavailableError"
    );
    expect(new SandboxDatabaseFullError("test", 1).name).toBe(
      "PodDatabaseFullError"
    );
  });

  test("the database handle type remains compatible", () => {
    const name = uniqueName("compatibility");
    createDatabaseFile(name);

    const legacyHandle: PodDatabase = db(name);
    const sandboxHandle: SandboxDatabase = legacyHandle;
    expect(sandboxHandle).toBe(legacyHandle);
  });
});

describe("sandbox database owner guard", () => {
  test("both owner ids absent throws even when the file exists", () => {
    const name = uniqueName("guard");
    createDatabaseFile(name);
    delete process.env[POD_SPACE_ID_ENV];
    expect(() => db(name)).toThrow(PodDatabasesUnavailableError);
    expect(() => db(name)).toThrow(/has no database owner/);
  });

  test("empty owner ids are treated as absent", () => {
    const name = uniqueName("guard");
    createDatabaseFile(name);
    process.env[POD_SPACE_ID_ENV] = "";
    process.env[FRAME_ID_ENV] = "";
    expect(() => db(name)).toThrow(PodDatabasesUnavailableError);
  });

  test("FRAME_ID makes databases available without SPACE_ID", () => {
    const name = uniqueName("frame_guard");
    createDatabaseFile(name);
    delete process.env[POD_SPACE_ID_ENV];
    process.env[FRAME_ID_ENV] = "fil_test_frame";
    process.env[FRAME_PUBLICATION_DESCRIPTOR_PATH_ENV] =
      createFramePublicationDescriptor([name]);

    expect(() => db(name)).not.toThrow();
  });

  test("the guard runs before the missing-file check", () => {
    delete process.env[POD_SPACE_ID_ENV];
    delete process.env[FRAME_ID_ENV];
    expect(() => db(uniqueName("guard"))).toThrow(PodDatabasesUnavailableError);
  });
});

describe("Frame publication database contract", () => {
  function frameInvocationEnv(descriptorPath?: string) {
    return {
      [SANDBOX_DATABASES_DIR_ENV]: databasesDir,
      [SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV]: String(ONE_GIB_BYTES),
      [FRAME_ID_ENV]: "fil_test_frame",
      ...(descriptorPath
        ? { [FRAME_PUBLICATION_DESCRIPTOR_PATH_ENV]: descriptorPath }
        : {}),
    };
  }

  test("opens only databases declared by the selected publication", () => {
    const declared = uniqueName("frame_db");
    const undeclared = uniqueName("frame_db");
    createDatabaseFile(declared);
    createDatabaseFile(undeclared);
    const descriptorPath = createFramePublicationDescriptor([declared]);

    expect(() =>
      runWithInvocationEnv(frameInvocationEnv(descriptorPath), () =>
        db(declared)
      )
    ).not.toThrow();
    expect(() =>
      runWithInvocationEnv(frameInvocationEnv(descriptorPath), () =>
        db(undeclared)
      )
    ).toThrow(FrameDatabaseNotDeclaredError);
  });

  test("reports declared state that reconciliation has not created", () => {
    const name = uniqueName("frame_db");
    const descriptorPath = createFramePublicationDescriptor([name]);

    expect(() =>
      runWithInvocationEnv(frameInvocationEnv(descriptorPath), () => db(name))
    ).toThrow(FrameDatabaseUnavailableError);
    expect(existsSync(join(databasesDir, `${name}.db`))).toBe(false);
  });

  test("requires a readable, supported publication descriptor", () => {
    const name = uniqueName("frame_db");
    createDatabaseFile(name);

    expect(() =>
      runWithInvocationEnv(frameInvocationEnv(), () => db(name))
    ).toThrow(FramePublicationDescriptorError);

    const unsupported = createFramePublicationDescriptor(
      [name],
      SUPPORTED_FRAME_PUBLICATION_SCHEMA_VERSION + 1
    );
    expect(() =>
      runWithInvocationEnv(frameInvocationEnv(unsupported), () => db(name))
    ).toThrow(FramePublicationDescriptorError);
  });

  test("rechecks declarations before returning a warm cached database", () => {
    const name = uniqueName("frame_db");
    createDatabaseFile(name);
    const declaringPublication = createFramePublicationDescriptor([name]);
    const removingPublication = createFramePublicationDescriptor([]);

    runWithInvocationEnv(frameInvocationEnv(declaringPublication), () =>
      db(name)
    );
    expect(() =>
      runWithInvocationEnv(frameInvocationEnv(removingPublication), () =>
        db(name)
      )
    ).toThrow(FrameDatabaseNotDeclaredError);
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
    delete process.env[SANDBOX_DATABASES_DIR_ENV];
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
    delete process.env[SANDBOX_DATABASES_DIR_ENV];
    const name = uniqueName("nodir");
    expect(() => db(name)).toThrow(PodDatabaseError);
    expect(() => db(name)).toThrow(/DUST_SANDBOX_DATABASES_DIR is not set/);
  });

  test("an empty databases dir env var is treated as absent", () => {
    // dsbx passes env through verbatim; empty means the same broken launch
    // context as unset, and this is the one layer that normalizes it.
    process.env[SANDBOX_DATABASES_DIR_ENV] = "";
    process.env[POD_DATABASES_DIR_ENV] = databasesDir;
    const name = uniqueName("nodir");
    expect(() => db(name)).toThrow(PodDatabaseError);
    expect(() => db(name)).toThrow(/DUST_SANDBOX_DATABASES_DIR is not set/);
  });
});

describe("app prefix resolution", () => {
  // Each database gets a table named after the app that owns it, so the assertions can tell
  // which FILE db() opened rather than trusting the name it was asked for.
  function createDatabaseOwnedBy(fileName: string, owner: string): void {
    createDatabaseFile(fileName, `CREATE TABLE ${owner}_marker (id INTEGER)`);
  }

  function ownerOf(name: string): string {
    const row = db(name)
      .$client.query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_marker'"
      )
      .get();
    if (row === null) {
      throw new Error(`No marker table in database ${name}`);
    }
    return row.name.replace(/_marker$/, "");
  }

  test("opens the app-prefixed database when it exists", () => {
    const name = uniqueName("chat");
    process.env[SANDBOX_DATABASE_PREFIX_ENV] = "myapp__";
    createDatabaseOwnedBy(`myapp__${name}`, "myapp");

    expect(ownerOf(name)).toBe("myapp");
  });

  test("reads the legacy Pod prefix from an invocation context", () => {
    const name = uniqueName("chat");
    createDatabaseOwnedBy(`legacyapp__${name}`, "legacyapp");

    expect(
      runWithInvocationEnv(
        {
          [POD_DATABASES_DIR_ENV]: databasesDir,
          [POD_DATABASE_MAX_SIZE_BYTES_ENV]: String(ONE_GIB_BYTES),
          [POD_SPACE_ID_ENV]: "spc_test_pod",
          [POD_DATABASE_PREFIX_ENV]: "legacyapp__",
        },
        () => ownerOf(name)
      )
    ).toBe("legacyapp");
  });

  test("prefers the canonical prefix over the legacy key", () => {
    const name = uniqueName("chat");
    process.env[SANDBOX_DATABASE_PREFIX_ENV] = "canonical__";
    process.env[POD_DATABASE_PREFIX_ENV] = "legacy__";
    createDatabaseOwnedBy(`canonical__${name}`, "canonical");
    createDatabaseOwnedBy(`legacy__${name}`, "legacy");

    expect(ownerOf(name)).toBe("canonical");
  });

  test("prefers the app-prefixed database over a same-named legacy one", () => {
    const name = uniqueName("chat");
    process.env[SANDBOX_DATABASE_PREFIX_ENV] = "myapp__";
    createDatabaseOwnedBy(name, "legacy");
    createDatabaseOwnedBy(`myapp__${name}`, "myapp");

    expect(ownerOf(name)).toBe("myapp");
  });

  test("falls back to a legacy unprefixed database", () => {
    // Transitional: databases created before app namespacing keep their bare filenames, and
    // litestream replicates them under a prefix keyed on that filename.
    const name = uniqueName("chat");
    process.env[SANDBOX_DATABASE_PREFIX_ENV] = "myapp__";
    createDatabaseOwnedBy(name, "legacy");

    expect(ownerOf(name)).toBe("legacy");
  });

  test("two apps asking for the same name get their own databases", () => {
    const name = uniqueName("chat");
    createDatabaseOwnedBy(`myapp__${name}`, "myapp");
    createDatabaseOwnedBy(`otherapp__${name}`, "otherapp");

    process.env[SANDBOX_DATABASE_PREFIX_ENV] = "myapp__";
    expect(ownerOf(name)).toBe("myapp");
    process.env[SANDBOX_DATABASE_PREFIX_ENV] = "otherapp__";
    expect(ownerOf(name)).toBe("otherapp");
  });

  test("uses the bare name when no prefix is set", () => {
    const name = uniqueName("chat");
    createDatabaseOwnedBy(name, "bare");

    expect(ownerOf(name)).toBe("bare");
  });

  test("an empty prefix means unprefixed", () => {
    // front passes "" for functions published outside an app folder.
    const name = uniqueName("chat");
    process.env[SANDBOX_DATABASE_PREFIX_ENV] = "";
    createDatabaseOwnedBy(name, "bare");

    expect(ownerOf(name)).toBe("bare");
  });

  test("falls back to the bare name when the prefix breaks the name contract", () => {
    // A prefix this long cannot produce a valid qualified name, so reconcile could never have
    // created one; looking for it would only mask the database that does exist.
    const name = uniqueName("chat");
    process.env[SANDBOX_DATABASE_PREFIX_ENV] = `${"a".repeat(60)}__`;
    createDatabaseOwnedBy(name, "bare");

    expect(ownerOf(name)).toBe("bare");
  });

  test("still throws when neither the prefixed nor the bare database exists", () => {
    const name = uniqueName("missing");
    process.env[SANDBOX_DATABASE_PREFIX_ENV] = "myapp__";

    expect(() => db(name)).toThrow(PodDatabaseNotDeclaredError);
  });

  // A resident server serves concurrent invocations from different apps without
  // touching process.env, so the prefix has to come from the invocation context.
  describe("inside an invocation context", () => {
    const contextEnv = (prefix: string) => ({
      [SANDBOX_DATABASES_DIR_ENV]: databasesDir,
      [SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV]: String(ONE_GIB_BYTES),
      [POD_SPACE_ID_ENV]: "spc_test_pod",
      [SANDBOX_DATABASE_PREFIX_ENV]: prefix,
    });

    test("reads the prefix from the context env", () => {
      const name = uniqueName("chat");
      createDatabaseOwnedBy(`myapp__${name}`, "myapp");

      expect(
        runWithInvocationEnv(contextEnv("myapp__"), () => ownerOf(name))
      ).toBe("myapp");
    });

    test("accepts a Frame-only invocation context", () => {
      const name = uniqueName("frame_context");
      createDatabaseOwnedBy(name, "frame");
      const descriptorPath = createFramePublicationDescriptor([name]);

      expect(
        runWithInvocationEnv(
          {
            [SANDBOX_DATABASES_DIR_ENV]: databasesDir,
            [SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV]: String(ONE_GIB_BYTES),
            [FRAME_ID_ENV]: "fil_test_frame",
            [FRAME_PUBLICATION_DESCRIPTOR_PATH_ENV]: descriptorPath,
            [SANDBOX_DATABASE_PREFIX_ENV]: "",
          },
          () => ownerOf(name)
        )
      ).toBe("frame");
    });

    test("the context's prefix wins over the one in process.env", () => {
      const name = uniqueName("chat");
      createDatabaseOwnedBy(`myapp__${name}`, "myapp");
      createDatabaseOwnedBy(`otherapp__${name}`, "otherapp");
      process.env[SANDBOX_DATABASE_PREFIX_ENV] = "myapp__";

      expect(
        runWithInvocationEnv(contextEnv("otherapp__"), () => ownerOf(name))
      ).toBe("otherapp");
    });

    test("a context without a prefix ignores the one in process.env", () => {
      const name = uniqueName("chat");
      createDatabaseOwnedBy(name, "bare");
      createDatabaseOwnedBy(`myapp__${name}`, "myapp");
      process.env[SANDBOX_DATABASE_PREFIX_ENV] = "myapp__";

      expect(runWithInvocationEnv(contextEnv(""), () => ownerOf(name))).toBe(
        "bare"
      );
    });
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
    process.env[SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV] = "20480"; // 5 pages of 4096.

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
    process.env[SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV] = String(
      2 * ONE_GIB_BYTES
    );

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
    delete process.env[SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV];
    expect(() => db(name)).toThrow(PodDatabaseError);
    expect(() => db(name)).toThrow(
      /DUST_SANDBOX_DATABASE_MAX_SIZE_BYTES is not set/
    );
  });

  test("throws when the quota env var is not a positive integer", () => {
    const name = uniqueName("quota");
    createDatabaseFile(name);
    // Canonical decimal digits only: Number() alone would accept "1e3",
    // "0x10" or " 42 ".
    process.env[POD_DATABASE_MAX_SIZE_BYTES_ENV] = String(ONE_GIB_BYTES);
    const invalid = ["0", "-1", "1.5", "abc", "1e100", "1e3", "0x10", " 42 "];
    for (const raw of invalid) {
      process.env[SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV] = raw;
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
    process.env[SANDBOX_DATABASE_MAX_SIZE_BYTES_ENV] = "20480"; // 5 pages of 4096.

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
