import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { type DatabaseSchemaError, extractDatabaseSchema } from "./db.ts";
import type { Result } from "./result.ts";
import type { DatabaseSchemaErrorKind } from "./types/db.ts";

const fixturesDir = join(import.meta.dir, "fixtures");

function expectDbError(
  result: Result<unknown, DatabaseSchemaError>,
  kind: DatabaseSchemaErrorKind,
  messagePattern: RegExp
): void {
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error.kind).toBe(kind);
    expect(result.error.message).toMatch(messagePattern);
  }
}

function unwrap<T>(result: Result<T, DatabaseSchemaError>): T {
  if (result.isErr()) {
    throw new Error(`expected ok result, got: ${result.error.message}`);
  }
  return result.value;
}

// One schema file at a time, exactly as `dsbx db reconcile` validates it.
function extractFixture(name: string) {
  return extractDatabaseSchema(
    name,
    join("databases", `${name}.db.ts`),
    join(fixturesDir, "databases", `${name}.db.ts`)
  );
}

describe("database schema validation (reconcile's gate)", () => {
  test("accepts the chat fixture", async () => {
    unwrap(await extractFixture("chat"));
  });

  // The extracted shape stays runner-internal (validation + reconcile's destructive
  // pre-check); these assertions pin the duck-typed drizzle reads the rules rely on.
  test("extracts the full shape of one schema file", async () => {
    const chat = unwrap(
      await extractDatabaseSchema(
        "chat",
        join("databases", "chat.db.ts"),
        join(fixturesDir, "databases", "chat.db.ts")
      )
    );
    expect(chat.schemaFile).toBe(join("databases", "chat.db.ts"));
    expect(Object.keys(chat.tables).sort()).toEqual([
      "messages",
      "settings",
      "users",
    ]);

    const users = chat.tables.users;
    expect(users.columns.id).toEqual({
      type: "integer",
      mode: null,
      notNull: true,
      hasDefault: true,
      primaryKey: true,
      autoIncrement: true,
    });
    expect(users.columns.handle).toEqual({
      type: "text",
      mode: null,
      notNull: true,
      hasDefault: false,
      primaryKey: false,
      autoIncrement: false,
    });
    // Column modes are recorded, including the columnType-derived json mode.
    expect(users.columns.created_at.mode).toBe("timestamp");
    expect(users.columns.created_at.type).toBe("integer");
    expect(users.columns.updated_at.mode).toBe("timestamp_ms");
    // $defaultFn counts as hasDefault.
    expect(users.columns.updated_at.hasDefault).toBe(true);
    expect(users.columns.attachments.mode).toBe("json");
    expect(users.columns.attachments.type).toBe("text");
    expect(users.columns.active.mode).toBe("boolean");
    expect(users.columns.active.hasDefault).toBe(true);
    expect(users.columns.score.type).toBe("real");
    expect(users.columns.counter.type).toBe("blob");
    expect(users.columns.counter.mode).toBe("bigint");

    // Indexes: explicit uniqueIndex + multi-column index, order preserved.
    expect(users.indexes.users_handle_idx).toEqual({
      unique: true,
      columns: ["handle"],
    });
    expect(users.indexes.users_created_idx).toEqual({
      unique: false,
      columns: ["created_at", "handle"],
    });
    expect(chat.tables.messages.indexes.messages_slug_idx).toEqual({
      unique: true,
      columns: ["slug"],
    });

    // Table-level single-column primaryKey folds into the column flag.
    const settings = chat.tables.settings;
    expect(settings.columns.key.primaryKey).toBe(true);
    expect(settings.columns.key.autoIncrement).toBe(false);
    expect(settings.indexes.settings_scope_value_idx).toEqual({
      unique: true,
      columns: ["scope", "value"],
    });
  });

  test("rejects inline foreign keys", async () => {
    expectDbError(
      await extractFixture("fk"),
      "database_schema_invalid",
      /foreign keys .* not allowed/
    );
  });

  test("rejects table-level foreign keys", async () => {
    expectDbError(
      await extractFixture("fk_table"),
      "database_schema_invalid",
      /foreign keys .* not allowed/
    );
  });

  test("rejects CHECK constraints", async () => {
    expectDbError(
      await extractFixture("checked"),
      "database_schema_invalid",
      /CHECK constraints are not allowed/
    );
  });

  test("rejects a column-level .unique() constraint", async () => {
    expectDbError(
      await extractFixture("unique_column"),
      "database_schema_invalid",
      /use uniqueIndex\(\) instead/
    );
  });

  test("rejects a table-level unique() constraint", async () => {
    expectDbError(
      await extractFixture("unique_table"),
      "database_schema_invalid",
      /use uniqueIndex\(\) instead/
    );
  });

  test("rejects a schema file exporting no tables", async () => {
    expectDbError(
      await extractFixture("empty"),
      "database_schema_invalid",
      /exports no tables/
    );
  });

  test("rejects a missing schema file", async () => {
    expectDbError(
      await extractFixture("nosuchdb"),
      "database_schema_unresolvable",
      /schema file not found/
    );
  });

  test("rejects a table name with a reserved prefix", async () => {
    expectDbError(
      await extractFixture("reserved_prefix"),
      "database_schema_invalid",
      /reserved prefix/
    );
  });

  test("rejects a column named after an Object.prototype key", async () => {
    expectDbError(
      await extractFixture("proto_column"),
      "database_schema_invalid",
      /"__proto__" is reserved/
    );
  });
});
