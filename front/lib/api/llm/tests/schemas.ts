import { z } from "zod";

import type { ResponseFormat } from "@app/types";

const UserProfileResponseFormat: ResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "user_profile",
    schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the user" },
        email: { type: "string", description: "Email address" },
        age: { type: "number", description: "Age in years" },
        is_active: {
          type: "boolean",
          description: "Whether the user account is active",
        },
      },
      required: ["name", "email", "age", "is_active"],
      additionalProperties: false,
    },
  },
};

const DataExtractionResponseFormat: ResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "data_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        author: { type: ["string", "null"] },
        publication_date: { type: ["string", "null"] },
        extracted_entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["person", "organization", "location", "date"],
              },
              value: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["type", "value", "confidence"],
            additionalProperties: false,
          },
        },
        has_tables: { type: "boolean" },
      },
      required: [
        "title",
        "author",
        "publication_date",
        "extracted_entities",
        "has_tables",
      ],
      additionalProperties: false,
    },
  },
};

const UserProfileStructuredOutputSchema = z.object({
  name: z.string().describe("Full name of the user"),
  email: z.string().email().describe("Email address"),
  age: z.number().int().positive().describe("Age in years"),
  is_active: z.boolean().describe("Whether the user account is active"),
});

const DataExtractionStructuredOutputSchema = z.object({
  title: z.string(),
  author: z.string().nullable(),
  publication_date: z.string().nullable(),
  extracted_entities: z.array(
    z.object({
      type: z.enum(["person", "organization", "location", "date"]),
      value: z.string(),
      confidence: z.number(),
    })
  ),
  has_tables: z.boolean(),
});

export type TestStructuredOutputSchema =
  | typeof UserProfileStructuredOutputSchema
  | typeof DataExtractionStructuredOutputSchema;

const TEST_STRUCTURED_OUTPUT_KEYS = [
  "user-profile",
  "data-extraction",
] as const;
export type TestStructuredOutputKey =
  (typeof TEST_STRUCTURED_OUTPUT_KEYS)[number];

export const TEST_RESPONSE_FORMATS: Record<
  TestStructuredOutputKey,
  ResponseFormat
> = {
  "user-profile": UserProfileResponseFormat,
  "data-extraction": DataExtractionResponseFormat,
} as const;

export const TEST_STRUCTURED_OUTPUT_SCHEMAS: Record<
  TestStructuredOutputKey,
  TestStructuredOutputSchema
> = {
  "user-profile": UserProfileStructuredOutputSchema,
  "data-extraction": DataExtractionStructuredOutputSchema,
} as const;
