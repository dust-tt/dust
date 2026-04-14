// It's okay here as we are hardcoding the input schemas and testing agains't the public ones.

import { findMatchingSubSchemas } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { ConfigurableToolInputJSONSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  ensurePathExists,
  hasNoRequiredProperties,
  jsonSchemaHasRequiredDustToolInput,
  setValueAtPath,
  validateJsonSchema,
} from "@app/lib/utils/json_schemas";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

describe("JSON Schema Utilities", () => {
  describe("ensurePathExists and setValueAtPath", () => {
    it("should initialize intermediate objects based on path", () => {
      const obj: Record<string, unknown> = {};

      ensurePathExists(obj, ["filter", "stringParam"]);
      setValueAtPath(obj, ["filter", "stringParam"], "test-value");

      expect(obj).toEqual({
        filter: {
          stringParam: "test-value",
        },
      });
    });

    it("should initialize intermediate arrays based on path", () => {
      const obj: Record<string, unknown> = {};

      // ensurePathExists creates path up to (but not including) the last element
      // So for path ["filter", "items", 0, "field"], it creates filter.items[0]
      ensurePathExists(obj, ["filter", "items", 0, "field"]);
      setValueAtPath(obj, ["filter", "items", 0, "field"], "test");

      expect(obj).toEqual({
        filter: {
          items: [{ field: "test" }],
        },
      });
    });

    it("should handle array property named 'items' (like filter.items array)", () => {
      // Real-world scenario: schema has filter.items as an array property
      // Path ["filter", "items", 0, "field"] should create:
      // - filter as object
      // - items as array (because next key is 0, a number)
      // - items[0] as object
      // - field as the value
      const obj: Record<string, unknown> = {};

      ensurePathExists(obj, ["filter", "items", 0, "field"]);
      setValueAtPath(obj, ["filter", "items", 0, "field"], "indicator-id");

      expect(obj).toEqual({
        filter: {
          items: [
            {
              field: "indicator-id",
            },
          ],
        },
      });
    });

    it("should handle configuration storage path with double 'items' marker", () => {
      // When iterateOverSchemaPropertiesRecursive processes an array property named "items",
      // it generates path: ["filter", "items", "items", "field"]
      // - first "items" is the actual property name
      // - second "items" is the marker added for array element schema
      // For configuration storage, this becomes nested objects (not actual arrays)
      const obj: Record<string, unknown> = {};

      ensurePathExists(obj, ["filter", "items", "items", "field"]);
      setValueAtPath(obj, ["filter", "items", "items", "field"], {
        value: "indicator-id",
        mimeType: "application/vnd.dust.tool-input.string",
      });

      expect(obj).toEqual({
        filter: {
          items: {
            items: {
              field: {
                value: "indicator-id",
                mimeType: "application/vnd.dust.tool-input.string",
              },
            },
          },
        },
      });
    });

    it("should handle multiple array indices", () => {
      const obj: Record<string, unknown> = {};

      // Set multiple items in the array
      ensurePathExists(obj, ["items", 0, "name"]);
      setValueAtPath(obj, ["items", 0, "name"], "first");

      ensurePathExists(obj, ["items", 1, "name"]);
      setValueAtPath(obj, ["items", 1, "name"], "second");

      expect(obj).toEqual({
        items: [{ name: "first" }, { name: "second" }],
      });
    });

    it("should not overwrite existing values", () => {
      const obj: Record<string, unknown> = {
        filter: {
          existingKey: "existing-value",
        },
      };

      ensurePathExists(obj, ["filter", "newKey"]);
      setValueAtPath(obj, ["filter", "newKey"], "new-value");

      expect(obj).toEqual({
        filter: {
          existingKey: "existing-value",
          newKey: "new-value",
        },
      });
    });
  });

  describe("findMatchingSchemaKeys", () => {
    it("should return property keys when properties match the target schema", () => {
      // Create a complex schema with nested properties
      const mainSchema: JSONSchema = {
        type: "object",
        properties: {
          config: {
            type: "object",
            properties: {
              userPreferences: {
                type: "object",
                properties: {
                  theme: {
                    type: "object",
                    properties: {
                      value: {
                        type: "string",
                      },
                      mimeType: {
                        type: "string",
                        const: "application/vnd.dust.tool-input.string",
                      },
                    },
                    required: ["value", "mimeType"],
                    additionalProperties: false,
                    $schema: "http://json-schema.org/draft-07/schema#",
                  },
                  notifications: {
                    type: "object",
                    properties: {
                      value: {
                        type: "boolean",
                      },
                      mimeType: {
                        type: "string",
                        const: "application/vnd.dust.tool-input.boolean",
                      },
                    },
                    required: ["value", "mimeType"],
                    additionalProperties: false,
                    $schema: "http://json-schema.org/draft-07/schema#",
                  },
                },
              },
              systemSettings: {
                type: "object",
                properties: {
                  maxRetries: {
                    type: "object",
                    properties: {
                      value: {
                        type: "number",
                      },
                      mimeType: {
                        type: "string",
                        const: "application/vnd.dust.tool-input.number",
                      },
                    },
                    required: ["value", "mimeType"],
                    additionalProperties: false,
                    $schema: "http://json-schema.org/draft-07/schema#",
                  },
                  debugMode: {
                    type: "object",
                    properties: {
                      value: {
                        type: "boolean",
                      },
                      mimeType: {
                        type: "string",
                        const: "application/vnd.dust.tool-input.boolean",
                      },
                    },
                    required: ["value", "mimeType"],
                    additionalProperties: false,
                    $schema: "http://json-schema.org/draft-07/schema#",
                  },
                },
              },
            },
          },
        },
      };

      // Look for STRING configuration schema
      const result = findMatchingSubSchemas(
        mainSchema,
        INTERNAL_MIME_TYPES.TOOL_INPUT.STRING
      );
      expect(Object.keys(result)).toContain("config.userPreferences.theme");
    });

    it("should return array item keys when array items match the target schema", () => {
      // Create a schema with array items containing configurable schemas
      const mainSchema: JSONSchema = {
        type: "object",
        properties: {
          dataSourceConfigs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      uri: {
                        type: "string",
                        pattern:
                          "^data_source_configuration:\\/\\/dust\\/w\\/(\\w+)\\/data_source_configurations\\/(\\w+)$",
                      },
                      mimeType: {
                        type: "string",
                        const: "application/vnd.dust.tool-input.data-source",
                      },
                    },
                    required: ["uri", "mimeType"],
                    additionalProperties: false,
                  },
                  $schema: "http://json-schema.org/draft-07/schema#",
                },
                settings: {
                  type: "object",
                  properties: {
                    tables: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          uri: {
                            type: "string",
                            pattern:
                              "^table_configuration:\\/\\/dust\\/w\\/(\\w+)\\/(?:table_configurations\\/(\\w+)|data_source_views\\/(\\w+)\\/tables\\/(.+))$",
                          },
                          mimeType: {
                            type: "string",
                            const: "application/vnd.dust.tool-input.table",
                          },
                        },
                        required: ["uri", "mimeType"],
                        additionalProperties: false,
                      },
                      $schema: "http://json-schema.org/draft-07/schema#",
                    },
                  },
                },
              },
            },
          },
        },
      };

      // Look for TABLE configuration schema
      const result = findMatchingSubSchemas(
        mainSchema,
        INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE
      );
      expect(Object.keys(result)).toContain(
        "dataSourceConfigs.items.settings.tables"
      );
    });

    it("should handle complex nested schemas with AGENT configuration", () => {
      // Create a complex schema with deeply nested AGENT configuration
      const mainSchema: JSONSchema = {
        type: "object",
        properties: {
          workflow: {
            type: "object",
            properties: {
              steps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    action: {
                      type: "object",
                      properties: {
                        executor: {
                          type: "object",
                          properties: {
                            uri: {
                              type: "string",
                              pattern:
                                "^agent:\\/\\/dust\\/w\\/(\\w+)\\/agents\\/([\\w-]+)$",
                            },
                            mimeType: {
                              type: "string",
                              const: "application/vnd.dust.tool-input.agent",
                            },
                          },
                          required: ["uri", "mimeType"],
                          additionalProperties: false,
                          $schema: "http://json-schema.org/draft-07/schema#",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      // Look for AGENT configuration schema
      const result = findMatchingSubSchemas(
        mainSchema,
        INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT
      );
      expect(Object.keys(result)).toContain(
        "workflow.steps.items.action.executor"
      );
    });

    it("should not match other things when schema is nullable", () => {
      const mainSchema: JSONSchema = {
        type: "object",
        properties: {
          requiredString: {
            type: "object",
            properties: {
              value: {
                type: "string",
              },
              mimeType: {
                type: "string",
                const: "application/vnd.dust.tool-input.string",
              },
            },
            required: ["value", "mimeType"],
            additionalProperties: false,
            $schema: "http://json-schema.org/draft-07/schema#",
          },
          optionalTimeFrame:
            ConfigurableToolInputJSONSchemas[
              INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME
            ],
        },
        required: ["optionalString"],
      };

      const r = findMatchingSubSchemas(
        mainSchema,
        INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME
      );
      expect(Object.keys(r)).toStrictEqual(["optionalTimeFrame"]);
    });

    it("should handle arrays of any", () => {
      // Schema we get with the zod schema z.object({ query: z.array(z.any()) }).
      const mainSchema: JSONSchema = {
        type: "object",
        properties: {
          query: {
            type: "array",
          },
        },
      };

      for (const mimeType of Object.values(INTERNAL_MIME_TYPES.TOOL_INPUT)) {
        const result = findMatchingSubSchemas(mainSchema, mimeType);
        // It should not match any existing type.
        expect(Object.keys(result)).toStrictEqual([]);
      }
    });
  });
});

// Schema where "required" is misplaced inside "properties" instead of at the object level.
const SCHEMA_WITH_REQUIRED_INSIDE_PROPERTIES = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the item.",
          },
          // "required" is incorrectly placed here, inside "properties"
          required: ["name", "value"],
          value: {
            type: "string",
            description: "Value of the item.",
          },
          active: {
            type: "boolean",
            description: "Whether the item is active.",
          },
        },
      },
    },
  },
};

describe("validateJsonSchema", () => {
  it("should reject schema with misplaced required inside properties", () => {
    const result = validateJsonSchema(SCHEMA_WITH_REQUIRED_INSIDE_PROPERTIES);
    expect(result.isValid).toBe(false);
  });

  it("should accept a valid schema", () => {
    const result = validateJsonSchema({
      type: "object",
      required: ["name", "value"],
      properties: {
        name: { type: "string" },
        value: { type: "string" },
      },
    });
    expect(result.isValid).toBe(true);
  });

  it("should accept a valid nested schema with items", () => {
    const result = validateJsonSchema({
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string" },
            },
          },
        },
      },
    });
    expect(result.isValid).toBe(true);
  });

  // Schema where top-level "required" references fields that only exist inside
  // a nested array's items, not at the root properties level.
  const schemaWithRequiredAtWrongLevel = {
    type: "object",
    properties: {
      calls: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            value: { type: "string" },
          },
        },
      },
    },
    required: ["name", "value"], // wrong: "name" and "value" are not root properties
  };

  it("should accept schema with required at wrong level when enforceRequiredFields=false (default)", () => {
    const result = validateJsonSchema(schemaWithRequiredAtWrongLevel);
    expect(result.isValid).toBe(true);
  });

  it("should reject schema with required at wrong level when enforceRequiredFields=true", () => {
    const result = validateJsonSchema(schemaWithRequiredAtWrongLevel, {
      enforceRequiredFields: true,
    });
    expect(result.isValid).toBe(false);
  });

  it("should accept schema with required correctly nested when enforceRequiredFields=true", () => {
    const result = validateJsonSchema(
      {
        type: "object",
        properties: {
          calls: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "value"],
              properties: {
                name: { type: "string" },
                value: { type: "string" },
              },
            },
          },
        },
      },
      { enforceRequiredFields: true }
    );
    expect(result.isValid).toBe(true);
  });
});

const DUST_DS_MIME = "application/vnd.dust.tool-input.data-source";

function dustDataSourceItemSchema(): JSONSchema {
  return {
    type: "object",
    properties: {
      uri: { type: "string" },
      mimeType: { const: DUST_DS_MIME },
    },
    required: ["uri", "mimeType"],
    additionalProperties: false,
  };
}

function minimalView(
  inputSchemas: Array<JSONSchema | undefined>
): MCPServerViewType {
  return {
    server: {
      tools: inputSchemas.map((inputSchema, i) => ({
        name: `tool_${i}`,
        description: "",
        inputSchema,
      })),
    },
  } as MCPServerViewType;
}

describe("jsonSchemaHasRequiredDustToolInput", () => {
  const fromRoot = true;

  it("returns false for null, undefined, and non-objects", () => {
    expect(jsonSchemaHasRequiredDustToolInput(null, fromRoot)).toBe(false);
    expect(jsonSchemaHasRequiredDustToolInput(undefined, fromRoot)).toBe(false);
    expect(jsonSchemaHasRequiredDustToolInput(1, fromRoot)).toBe(false);
    expect(jsonSchemaHasRequiredDustToolInput("x", fromRoot)).toBe(false);
  });

  it("returns false when path is not all-required even if schema is a Dust object", () => {
    const dustObject: JSONSchema = {
      type: "object",
      properties: {
        uri: { type: "string" },
        mimeType: { const: DUST_DS_MIME },
      },
      required: ["uri", "mimeType"],
    };
    expect(jsonSchemaHasRequiredDustToolInput(dustObject, false)).toBe(false);
  });

  it("returns true when the root schema is a Dust object and path is all-required", () => {
    const dustObject: JSONSchema = {
      type: "object",
      properties: {
        uri: { type: "string" },
        mimeType: { const: DUST_DS_MIME },
      },
      required: ["uri", "mimeType"],
    };
    expect(jsonSchemaHasRequiredDustToolInput(dustObject, true)).toBe(true);
  });

  it("detects required array property whose items are Dust objects (dataSources pattern)", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        dataSources: {
          type: "array",
          items: dustDataSourceItemSchema(),
        },
        objective: { type: "string" },
      },
      required: ["dataSources", "objective"],
      additionalProperties: false,
    };
    expect(jsonSchemaHasRequiredDustToolInput(schema, true)).toBe(true);
  });

  it("returns false when Dust-like items sit under an optional array property", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        dataSources: {
          type: "array",
          items: dustDataSourceItemSchema(),
        },
      },
      required: [],
    };
    expect(jsonSchemaHasRequiredDustToolInput(schema, true)).toBe(false);
  });

  it("returns false when Dust project field is optional at root", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        message: { type: "string" },
        dustProject: {
          type: "object",
          properties: {
            uri: { type: "string" },
            mimeType: { const: "application/vnd.dust.tool-input.dust-project" },
          },
          required: ["uri", "mimeType"],
        },
      },
      required: ["message"],
    };
    expect(jsonSchemaHasRequiredDustToolInput(schema, true)).toBe(false);
  });

  it("returns true when Dust project field is required at root", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        dustProject: {
          type: "object",
          properties: {
            uri: { type: "string" },
            mimeType: { const: "application/vnd.dust.tool-input.dust-project" },
          },
          required: ["uri", "mimeType"],
        },
      },
      required: ["dustProject"],
    };
    expect(jsonSchemaHasRequiredDustToolInput(schema, true)).toBe(true);
  });

  it("returns false when optional wrapper contains required Dust child", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        wrapper: {
          type: "object",
          properties: {
            dustProject: {
              type: "object",
              properties: {
                uri: { type: "string" },
                mimeType: {
                  const: "application/vnd.dust.tool-input.dust-project",
                },
              },
              required: ["uri", "mimeType"],
            },
          },
          required: ["dustProject"],
        },
      },
      required: [],
    };
    expect(jsonSchemaHasRequiredDustToolInput(schema, true)).toBe(false);
  });

  it("detects mimeType via enum strings under the Dust prefix", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        cfg: {
          type: "object",
          properties: {
            uri: { type: "string" },
            mimeType: {
              type: "string",
              enum: [
                "application/vnd.dust.tool-input.data-source",
                "application/vnd.dust.tool-input.folder",
              ],
            },
          },
        },
      },
      required: ["cfg"],
    };
    expect(jsonSchemaHasRequiredDustToolInput(schema, true)).toBe(true);
  });

  it("returns false when mimeType const is not a Dust tool-input type", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        x: {
          type: "object",
          properties: {
            mimeType: { const: "application/json" },
          },
        },
      },
      required: ["x"],
    };
    expect(jsonSchemaHasRequiredDustToolInput(schema, true)).toBe(false);
  });

  it("treats top-level schema array like oneOf: bad only if every branch requires Dust", () => {
    const onlyStrings: JSONSchema = {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    };
    expect(
      jsonSchemaHasRequiredDustToolInput([onlyStrings, onlyStrings], true)
    ).toBe(false);

    const withDust: JSONSchema = {
      type: "object",
      properties: {
        p: {
          type: "object",
          properties: {
            uri: { type: "string" },
            mimeType: { const: DUST_DS_MIME },
          },
          required: ["uri", "mimeType"],
        },
      },
      required: ["p"],
    };
    expect(
      jsonSchemaHasRequiredDustToolInput([onlyStrings, withDust], true)
    ).toBe(false);
    expect(jsonSchemaHasRequiredDustToolInput([withDust, withDust], true)).toBe(
      true
    );
  });

  it("oneOf: false when at least one branch has no required Dust path", () => {
    const clean: JSONSchema = {
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
    };
    const dustRequired: JSONSchema = {
      type: "object",
      properties: {
        p: {
          type: "object",
          properties: {
            uri: { type: "string" },
            mimeType: { const: DUST_DS_MIME },
          },
          required: ["uri", "mimeType"],
        },
      },
      required: ["p"],
    };
    expect(
      jsonSchemaHasRequiredDustToolInput({ oneOf: [clean, dustRequired] }, true)
    ).toBe(false);
  });

  it("anyOf: behaves like oneOf for required Dust (any clean branch is enough)", () => {
    const clean: JSONSchema = {
      type: "object",
      properties: { x: { type: "string" } },
      required: ["x"],
    };
    const dustRequired: JSONSchema = {
      type: "object",
      properties: {
        p: {
          type: "object",
          properties: {
            uri: { type: "string" },
            mimeType: { const: DUST_DS_MIME },
          },
          required: ["uri", "mimeType"],
        },
      },
      required: ["p"],
    };
    expect(
      jsonSchemaHasRequiredDustToolInput({ anyOf: [clean, dustRequired] }, true)
    ).toBe(false);
    expect(
      jsonSchemaHasRequiredDustToolInput(
        { anyOf: [dustRequired, dustRequired] },
        true
      )
    ).toBe(true);
  });

  it("oneOf: true when every branch forces required Dust", () => {
    const a: JSONSchema = {
      type: "object",
      properties: {
        p: {
          type: "object",
          properties: {
            uri: { type: "string" },
            mimeType: { const: DUST_DS_MIME },
          },
          required: ["uri", "mimeType"],
        },
      },
      required: ["p"],
    };
    expect(jsonSchemaHasRequiredDustToolInput({ oneOf: [a, a] }, true)).toBe(
      true
    );
  });

  it("allOf: true when any combined branch introduces required Dust", () => {
    const base: JSONSchema = {
      type: "object",
      properties: { x: { type: "string" } },
    };
    const extra: JSONSchema = {
      type: "object",
      properties: {
        p: {
          type: "object",
          properties: {
            uri: { type: "string" },
            mimeType: { const: DUST_DS_MIME },
          },
          required: ["uri", "mimeType"],
        },
      },
      required: ["p"],
    };
    expect(
      jsonSchemaHasRequiredDustToolInput({ allOf: [base, extra] }, true)
    ).toBe(true);
    expect(
      jsonSchemaHasRequiredDustToolInput({ allOf: [base, base] }, true)
    ).toBe(false);
  });

  it("accepts object-like schema without explicit type: object when properties carry Dust", () => {
    const schema = {
      properties: {
        dustProject: {
          type: "object",
          properties: {
            uri: { type: "string" },
            mimeType: { const: "application/vnd.dust.tool-input.dust-project" },
          },
          required: ["uri", "mimeType"],
        },
      },
      required: ["dustProject"],
    };
    expect(jsonSchemaHasRequiredDustToolInput(schema, true)).toBe(true);
  });

  it("detects Dust object when type is a tuple including object", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        v: {
          type: ["object", "null"] as unknown as JSONSchema["type"],
          properties: {
            uri: { type: "string" },
            mimeType: { const: DUST_DS_MIME },
          },
          required: ["uri", "mimeType"],
        },
      },
      required: ["v"],
    };
    expect(jsonSchemaHasRequiredDustToolInput(schema, true)).toBe(true);
  });

  it("root-level array schema passes path flag to items", () => {
    const schema: JSONSchema = {
      type: "array",
      items: dustDataSourceItemSchema(),
    };
    expect(jsonSchemaHasRequiredDustToolInput(schema, true)).toBe(true);
    expect(jsonSchemaHasRequiredDustToolInput(schema, false)).toBe(false);
  });

  it("tuple items array on property: any item schema with required Dust triggers", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        pair: {
          type: "array",
          items: [
            { type: "string" },
            {
              type: "object",
              properties: {
                uri: { type: "string" },
                mimeType: { const: DUST_DS_MIME },
              },
              required: ["uri", "mimeType"],
            },
          ],
        },
      },
      required: ["pair"],
    };
    expect(jsonSchemaHasRequiredDustToolInput(schema, true)).toBe(true);
  });
});

describe("hasNoRequiredProperties (MCP view)", () => {
  it("returns true when there are no input schemas", () => {
    expect(hasNoRequiredProperties(minimalView([]))).toBe(true);
  });

  it("returns true when every tool inputSchema is undefined", () => {
    expect(hasNoRequiredProperties(minimalView([undefined, undefined]))).toBe(
      true
    );
  });

  it("returns true when no tool requires Dust on a mandatory path", () => {
    const clean: JSONSchema = {
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    };
    expect(hasNoRequiredProperties(minimalView([clean]))).toBe(true);
  });

  it("returns false when any tool has required Dust path", () => {
    const clean: JSONSchema = {
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    };
    const bad: JSONSchema = {
      type: "object",
      properties: {
        dataSources: {
          type: "array",
          items: dustDataSourceItemSchema(),
        },
      },
      required: ["dataSources"],
    };
    expect(hasNoRequiredProperties(minimalView([clean, bad]))).toBe(false);
    expect(hasNoRequiredProperties(minimalView([bad]))).toBe(false);
  });
});
