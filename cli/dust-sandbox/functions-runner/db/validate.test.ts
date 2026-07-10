import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Result } from "../result.ts";
import type { DatabaseSchemaErrorKind } from "../types/db.ts";
import { type DatabaseSchemaError, extractDatabaseSchema } from "./validate.ts";

const fixturesDir = join(import.meta.dir, "..", "fixtures");

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
