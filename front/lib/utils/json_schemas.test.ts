import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

import { findMatchingSubSchemas } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { ConfigurableToolInputJSONSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";

describe("JSON Schema Utilities", () => {
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
              INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME
            ],
        },
        required: ["optionalString"],
      };

      const r = findMatchingSubSchemas(
        mainSchema,
        INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME
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
