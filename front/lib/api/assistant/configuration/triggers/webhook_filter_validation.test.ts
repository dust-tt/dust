import { validateWebhookFilter } from "@app/lib/api/assistant/configuration/triggers/webhook_filter_validation";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

const schema: JSONSchema = {
  type: "object",
  properties: {
    status: { type: "string" },
    nullableStatus: { type: ["string", "null"] },
    count: { type: "integer" },
    active: { type: "boolean" },
    tags: {
      type: "array",
      items: { type: "string" },
    },
    labels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          score: { type: "number" },
        },
      },
    },
  },
};

function expectValid(filter: string): void {
  const result = validateWebhookFilter(filter, schema);
  expect(result.isOk()).toBe(true);
}

function expectInvalid(filter: string, message: string): void {
  const result = validateWebhookFilter(filter, schema);
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error.message).toBe(message);
  }
}

describe("validateWebhookFilter", () => {
  it.each([
    '(eq "status" "open")',
    '(contains "nullableStatus" "open")',
    '(gt "count" 10)',
    '(eq "active" true)',
    '(has-any "tags" ("urgent" "vip"))',
    '(has "labels.*.name" "urgent")',
    '(has "labels.*.score" 0.8)',
    '(and (eq "status" "open") (exists "active"))',
  ])("accepts a type-compatible filter: %s", (filter) => {
    expectValid(filter);
  });

  it.each([
    {
      filter: '(has-any "status" ("open" "closed"))',
      message:
        'Operator "has-any" requires an array field, but "status" is string.',
    },
    {
      filter: '(contains "count" "1")',
      message:
        'Operator "contains" requires a string field, but "count" is integer.',
    },
    {
      filter: '(eq "count" "1")',
      message: 'Value for "count" must be integer, but received string.',
    },
    {
      filter: '(has "tags" 1)',
      message: 'Value for "tags" must be string, but received integer.',
    },
    {
      filter: '(eq "missing" "value")',
      message: 'Field "missing" does not exist in the event schema.',
    },
  ])("rejects an incompatible filter: $filter", ({ filter, message }) => {
    expectInvalid(filter, message);
  });

  it("rejects invalid syntax", () => {
    expectInvalid(
      '(eq "status" "open"',
      "Invalid filter syntax: Unbalanced parentheses"
    );
  });
});
