import {
  functionStateManifestSchema,
  POD_DATABASE_NAME_REGEX,
} from "@app/lib/api/sandbox_functions/manifests";
import { describe, expect, it } from "vitest";
import {
  DB_NAME_REGEX,
  RESERVED_OBJECT_KEYS,
} from "../../../../cli/dust-sandbox/functions-runner/manifest_types";

// The manifest shape is compile-time checked against the runner's manifest_types.ts (see
// manifests.ts); runtime constants can't be, so their mirrored values are asserted here.
describe("manifest.v1 mirror", () => {
  it("keeps the database name regex identical to the runner's", () => {
    expect(POD_DATABASE_NAME_REGEX.source).toBe(DB_NAME_REGEX.source);
    expect(POD_DATABASE_NAME_REGEX.flags).toBe(DB_NAME_REGEX.flags);
  });

  it("parses a valid manifest", () => {
    const result = functionStateManifestSchema.safeParse({
      version: 1,
      databases: {
        chat: {
          schemaFile: "databases/chat.db.ts",
          tables: {
            messages: {
              columns: {
                id: {
                  type: "integer",
                  mode: null,
                  notNull: true,
                  hasDefault: true,
                  primaryKey: true,
                  autoIncrement: true,
                },
              },
              indexes: {},
            },
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects every runner-reserved object key as a table name", () => {
    for (const key of RESERVED_OBJECT_KEYS) {
      const result = functionStateManifestSchema.safeParse({
        version: 1,
        databases: {
          chat: {
            schemaFile: "databases/chat.db.ts",
            // fromEntries defines an own property even for "__proto__" (an object literal
            // key would set the prototype instead).
            tables: Object.fromEntries([[key, { columns: {}, indexes: {} }]]),
          },
        },
      });
      expect(result.success).toBe(false);
    }
  });
});
