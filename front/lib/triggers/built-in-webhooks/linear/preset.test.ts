import { matchPayload, parseMatcherExpression } from "@app/lib/matcher";
import { LINEAR_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/linear/preset";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { describe, expect, it } from "vitest";

function getEvent(value: string) {
  const event = LINEAR_WEBHOOK_PRESET.events.find((e) => e.value === value);
  if (!event) {
    throw new Error(`Missing Linear event: ${value}`);
  }
  return event;
}

describe("Linear webhook preset schema", () => {
  it.each(["Issue", "Project"])(
    "nests the %s entity under `data` with action/type envelope",
    (value) => {
      const schema = getEvent(value).schema as JSONSchema;
      const properties = schema.properties ?? {};

      expect(properties).toHaveProperty("action");
      expect(properties).toHaveProperty("type");
      expect(properties).toHaveProperty("data");

      // The entity fields live under `data`, not at the top level.
      const dataSchema = properties.data as JSONSchema;
      expect(dataSchema.properties).toHaveProperty("labelIds");
      expect(properties).not.toHaveProperty("labelIds");
    }
  );
});

describe("Linear webhook filters against delivered payload", () => {
  const issueDeliveredPayload = {
    action: "update",
    type: "Issue",
    createdAt: "2026-07-07T00:00:00.000Z",
    url: "https://linear.app/dust/issue/ABC-123",
    data: {
      id: "issue-uuid",
      identifier: "ABC-123",
      title: "Something is broken",
      labelIds: ["label-uuid-1", "label-uuid-2"],
      labels: [{ id: "label-uuid-1", name: "bug", color: "#fff" }],
      state: { id: "s1", name: "In Progress", type: "started", color: "#000" },
    },
  };

  function parse(expression: string) {
    const result = parseMatcherExpression(expression);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  it("matches when the filter uses the `data.` prefix", () => {
    expect(
      matchPayload(
        issueDeliveredPayload,
        parse('(has "data.labelIds" "label-uuid-1")')
      )
    ).toBe(true);
    expect(
      matchPayload(
        issueDeliveredPayload,
        parse('(has "data.labels.*.name" "bug")')
      )
    ).toBe(true);
  });

  it("does not match the old envelope-less path (the bug being fixed)", () => {
    expect(
      matchPayload(
        issueDeliveredPayload,
        parse('(has "labelIds" "label-uuid-1")')
      )
    ).toBe(false);
  });
});
