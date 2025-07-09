import { describe, expect, it } from "vitest";

import { buildInternalId, parseInternalId } from "./utils";

describe("Remote Database Utils", () => {
  describe("buildInternalId", () => {
    it("should build internal ID with only database name", () => {
      const result = buildInternalId({
        databaseName: "my_database",
      });
      expect(result).toBe("my_database");
    });

    it("should build internal ID with database and schema names", () => {
      const result = buildInternalId({
        databaseName: "my_database",
        schemaName: "public",
      });
      expect(result).toBe("my_database.public");
    });

    it("should build internal ID with all components", () => {
      const result = buildInternalId({
        databaseName: "my_database",
        schemaName: "public",
        tableName: "users",
      });
      expect(result).toBe("my_database.public.users");
    });

    it("should handle dots in names by replacing them with __DUST_DOT__", () => {
      const result = buildInternalId({
        databaseName: "my.database",
        schemaName: "public.schema",
        tableName: "user.table",
      });
      expect(result).toBe(
        "my__DUST_DOT__database.public__DUST_DOT__schema.user__DUST_DOT__table"
      );
    });
  });

  describe("parseInternalId", () => {
    it("should parse internal ID with only database name", () => {
      const result = parseInternalId("my_database");
      expect(result).toEqual({
        databaseName: "my_database",
        schemaName: undefined,
        tableName: undefined,
      });
    });

    it("should parse internal ID with database and schema names", () => {
      const result = parseInternalId("my_database.public");
      expect(result).toEqual({
        databaseName: "my_database",
        schemaName: "public",
        tableName: undefined,
      });
    });

    it("should parse internal ID with all components", () => {
      const result = parseInternalId("my_database.public.users");
      expect(result).toEqual({
        databaseName: "my_database",
        schemaName: "public",
        tableName: "users",
      });
    });

    it("should throw error for invalid internal ID", () => {
      expect(() => parseInternalId("")).toThrow(
        "Invalid internal ID, it requires at least a database name: "
      );
    });
  });

  describe("buildInternalId and parseInternalId integration", () => {
    it("should correctly roundtrip internal IDs", () => {
      const original = {
        databaseName: "my_database",
        schemaName: "public",
        tableName: "users",
      };
      const built = buildInternalId(original);
      const parsed = parseInternalId(built);
      expect(parsed).toEqual(original);
    });

    it("should correctly roundtrip internal IDs with dots in names", () => {
      const original = {
        databaseName: "my.database",
        schemaName: "public.schema",
        tableName: "user.table",
      };
      const built = buildInternalId(original);
      const parsed = parseInternalId(built);
      expect(parsed).toEqual(original);
    });
  });
});
