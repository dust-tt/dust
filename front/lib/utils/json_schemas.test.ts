import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

import { ConfigurableToolInputJSONSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";

import { findMatchingSchemaKeys } from "./json_schemas";

describe("JSON Schema Utilities", () => {
  describe("findMatchingSchemaKeys", () => {
    it("should return an empty array when no matches are found", () => {
      const mainSchema: JSONSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
      };

      // Use DATA_SOURCE schema which won't match the mainSchema
      const targetSchema =
        ConfigurableToolInputJSONSchemas[
          INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE
        ];

      const result = findMatchingSchemaKeys(mainSchema, targetSchema);
      expect(result).toEqual([]);
    });

    it("should return an array with an empty string when the root schema matches", () => {
      // Use STRING schema as our test schema
      const stringSchema =
        ConfigurableToolInputJSONSchemas[
          INTERNAL_MIME_TYPES.CONFIGURATION.STRING
        ];

      // When comparing a schema with itself, it should match at the root level
      const result = findMatchingSchemaKeys(stringSchema, stringSchema);
      expect(result).toEqual([""]);
    });

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
                  theme:
                    ConfigurableToolInputJSONSchemas[
                      INTERNAL_MIME_TYPES.CONFIGURATION.STRING
                    ],
                  notifications:
                    ConfigurableToolInputJSONSchemas[
                      INTERNAL_MIME_TYPES.CONFIGURATION.BOOLEAN
                    ],
                },
              },
              systemSettings: {
                type: "object",
                properties: {
                  maxRetries:
                    ConfigurableToolInputJSONSchemas[
                      INTERNAL_MIME_TYPES.CONFIGURATION.NUMBER
                    ],
                  debugMode:
                    ConfigurableToolInputJSONSchemas[
                      INTERNAL_MIME_TYPES.CONFIGURATION.BOOLEAN
                    ],
                },
              },
            },
          },
        },
      };

      // Look for STRING configuration schema
      const targetSchema =
        ConfigurableToolInputJSONSchemas[
          INTERNAL_MIME_TYPES.CONFIGURATION.STRING
        ];

      const result = findMatchingSchemaKeys(mainSchema, targetSchema);
      expect(result).toContain("config.userPreferences.theme");
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
                source:
                  ConfigurableToolInputJSONSchemas[
                    INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE
                  ],
                settings: {
                  type: "object",
                  properties: {
                    tables:
                      ConfigurableToolInputJSONSchemas[
                        INTERNAL_MIME_TYPES.CONFIGURATION.TABLE
                      ],
                  },
                },
              },
            },
          },
        },
      };

      // Look for TABLE configuration schema
      const targetSchema =
        ConfigurableToolInputJSONSchemas[
          INTERNAL_MIME_TYPES.CONFIGURATION.TABLE
        ];

      const result = findMatchingSchemaKeys(mainSchema, targetSchema);
      expect(result).toContain("dataSourceConfigs.items.settings.tables");
    });

    it("should handle complex nested schemas with CHILD_AGENT configuration", () => {
      // Create a complex schema with deeply nested CHILD_AGENT configuration
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
                        executor:
                          ConfigurableToolInputJSONSchemas[
                            INTERNAL_MIME_TYPES.CONFIGURATION.CHILD_AGENT
                          ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      // Look for CHILD_AGENT configuration schema
      const targetSchema =
        ConfigurableToolInputJSONSchemas[
          INTERNAL_MIME_TYPES.CONFIGURATION.CHILD_AGENT
        ];

      const result = findMatchingSchemaKeys(mainSchema, targetSchema);
      expect(result).toContain("workflow.steps.items.action.executor");
    });
  });
});
