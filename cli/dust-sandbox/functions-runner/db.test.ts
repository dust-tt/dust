import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  type DatabaseSchemaError,
  readDeclaredDatabases,
  validateDeclaredDatabases,
} from "./db.ts";
import type { Result } from "./result.ts";
import type { DatabaseSchemaErrorKind } from "./types/db.ts";

const fixturesDir = join(import.meta.dir, "fixtures");
const fx = (n: string) => join(fixturesDir, n);

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
    expectDbError(
      await readDeclaredDatabases(fx("db-badtype.ts")),
      "databases_declaration_invalid",
      /expected array/
    );
  });

  test("rejects names violating the name contract", async () => {
    expectDbError(
      await readDeclaredDatabases(fx("db-badname.ts")),
      "databases_declaration_invalid",
      /must match/
    );
  });

  test("rejects duplicate names", async () => {
    expectDbError(
      await readDeclaredDatabases(fx("db-dupe.ts")),
      "databases_declaration_invalid",
      /duplicate/
    );
  });
});

describe("declared database validation", () => {
  test("accepts the chat fixture", async () => {
    unwrap(await validateDeclaredDatabases(fixturesDir, ["chat"]));
  });
  test("rejects inline foreign keys", async () => {
    expectDbError(
      await validateDeclaredDatabases(fixturesDir, ["fk"]),
      "database_schema_invalid",
      /foreign keys .* not allowed/
    );
  });

  test("rejects table-level foreign keys", async () => {
    expectDbError(
      await validateDeclaredDatabases(fixturesDir, ["fk_table"]),
      "database_schema_invalid",
      /foreign keys .* not allowed/
    );
  });

  test("rejects CHECK constraints", async () => {
    expectDbError(
      await validateDeclaredDatabases(fixturesDir, ["checked"]),
      "database_schema_invalid",
      /CHECK constraints are not allowed/
    );
  });

  test("rejects a column-level .unique() constraint", async () => {
    expectDbError(
      await validateDeclaredDatabases(fixturesDir, ["unique_column"]),
      "database_schema_invalid",
      /use uniqueIndex\(\) instead/
    );
  });

  test("rejects a table-level unique() constraint", async () => {
    expectDbError(
      await validateDeclaredDatabases(fixturesDir, ["unique_table"]),
      "database_schema_invalid",
      /use uniqueIndex\(\) instead/
    );
  });

  test("rejects a schema file exporting no tables", async () => {
    expectDbError(
      await validateDeclaredDatabases(fixturesDir, ["empty"]),
      "database_schema_invalid",
      /exports no tables/
    );
  });

  test("rejects a missing schema file", async () => {
    expectDbError(
      await validateDeclaredDatabases(fixturesDir, ["nosuchdb"]),
      "database_schema_unresolvable",
      /schema file not found/
    );
  });

  test("rejects a table name with a reserved prefix", async () => {
    expectDbError(
      await validateDeclaredDatabases(fixturesDir, ["reserved_prefix"]),
      "database_schema_invalid",
      /reserved prefix/
    );
  });

  test("rejects a column named after an Object.prototype key", async () => {
    expectDbError(
      await validateDeclaredDatabases(fixturesDir, ["proto_column"]),
      "database_schema_invalid",
      /"__proto__" is reserved/
    );
  });
});
