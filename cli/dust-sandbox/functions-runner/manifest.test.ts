import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  extractManifests,
  type FunctionStateManifest,
  type ManifestErrorKind,
  type ManifestResult,
  readDeclaredDatabases,
} from "./manifest.ts";

const fixturesDir = join(import.meta.dir, "fixtures");
const fx = (n: string) => join(fixturesDir, n);

function expectManifestError(
  result: ManifestResult<unknown>,
  kind: ManifestErrorKind,
  messagePattern: RegExp
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.kind).toBe(kind);
    expect(result.error.message).toMatch(messagePattern);
  }
}

function unwrap<T>(result: ManifestResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok result, got: ${result.error.message}`);
  }
  return result.value;
}

describe("readDeclaredDatabases", () => {
  test("returns [] when the function declares no databases", async () => {
    expect(unwrap(await readDeclaredDatabases(fx("greet.ts")))).toEqual([]);
  });

  test("returns the declared names", async () => {
    expect(unwrap(await readDeclaredDatabases(fx("db-chat.ts")))).toEqual([
      "chat",
    ]);
  });

  test("rejects a non-array declaration", async () => {
    expectManifestError(
      await readDeclaredDatabases(fx("db-badtype.ts")),
      "databases_declaration_invalid",
      /array of database names/
    );
  });

  test("rejects names violating the name contract", async () => {
    expectManifestError(
      await readDeclaredDatabases(fx("db-badname.ts")),
      "databases_declaration_invalid",
      /invalid database name "ChatDb"/
    );
  });

  test("rejects duplicate names", async () => {
    expectManifestError(
      await readDeclaredDatabases(fx("db-dupe.ts")),
      "databases_declaration_invalid",
      /duplicate/
    );
  });
});

describe("extractManifests", () => {
  test("extracts the full manifest for the chat fixture", async () => {
    const manifests: FunctionStateManifest = unwrap(
      await extractManifests(fixturesDir, ["chat"])
    );
    expect(manifests.version).toBe(1);
    expect(Object.keys(manifests.databases)).toEqual(["chat"]);

    const chat = manifests.databases.chat;
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
    expectManifestError(
      await extractManifests(fixturesDir, ["fk"]),
      "database_schema_invalid",
      /foreign keys .* not allowed/
    );
  });

  test("rejects table-level foreign keys", async () => {
    expectManifestError(
      await extractManifests(fixturesDir, ["fk_table"]),
      "database_schema_invalid",
      /foreign keys .* not allowed/
    );
  });

  test("rejects CHECK constraints", async () => {
    expectManifestError(
      await extractManifests(fixturesDir, ["checked"]),
      "database_schema_invalid",
      /CHECK constraints are not allowed/
    );
  });

  test("rejects a column-level .unique() constraint", async () => {
    expectManifestError(
      await extractManifests(fixturesDir, ["unique_column"]),
      "database_schema_invalid",
      /use uniqueIndex\(\) instead/
    );
  });

  test("rejects a table-level unique() constraint", async () => {
    expectManifestError(
      await extractManifests(fixturesDir, ["unique_table"]),
      "database_schema_invalid",
      /use uniqueIndex\(\) instead/
    );
  });

  test("rejects composite primary keys", async () => {
    expectManifestError(
      await extractManifests(fixturesDir, ["composite"]),
      "database_schema_invalid",
      /composite primary keys are not allowed/
    );
  });

  test("rejects a schema file exporting no tables", async () => {
    expectManifestError(
      await extractManifests(fixturesDir, ["empty"]),
      "database_schema_invalid",
      /exports no tables/
    );
  });

  test("rejects an SQL-expression index", async () => {
    expectManifestError(
      await extractManifests(fixturesDir, ["expr"]),
      "database_schema_invalid",
      /SQL expression/
    );
  });

  test("rejects a missing schema file", async () => {
    expectManifestError(
      await extractManifests(fixturesDir, ["nosuchdb"]),
      "database_schema_unresolvable",
      /schema file not found/
    );
  });

  test("rejects a table name with a reserved prefix", async () => {
    expectManifestError(
      await extractManifests(fixturesDir, ["reserved_prefix"]),
      "database_schema_invalid",
      /reserved prefix/
    );
  });

  test("rejects a column named after an Object.prototype key", async () => {
    expectManifestError(
      await extractManifests(fixturesDir, ["proto_column"]),
      "database_schema_invalid",
      /"__proto__" is reserved/
    );
  });
});
