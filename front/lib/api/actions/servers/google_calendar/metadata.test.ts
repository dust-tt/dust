import { GOOGLE_CALENDAR_TOOLS_METADATA } from "@app/lib/api/actions/servers/google_calendar/metadata";
import { describe, expect, it } from "vitest";
import { z } from "zod";

describe("Google Calendar event metadata", () => {
  it.each([
    "create_event",
    "update_event",
  ] as const)("accepts date-only values for %s", (toolName) => {
    const tool = GOOGLE_CALENDAR_TOOLS_METADATA.find(
      (metadata) => metadata.name === toolName
    );

    if (!tool) {
      throw new Error(`Missing ${toolName} metadata`);
    }

    const dates = {
      start: { date: "2026-08-07" },
      end: { date: "2026-08-08" },
    };
    const input =
      toolName === "create_event"
        ? { summary: "Company holiday", ...dates }
        : { eventId: "event-123", ...dates };

    const result = z.object(tool.schema).safeParse(input);

    expect(result.success).toBe(true);
  });
});
