import { describe, expect, it } from "vitest";
import { z } from "zod";

import { OutlookEventSchema } from "./outlook_api_helper";
import { renderOutlookEvent } from "./rendering";

const BASE_EVENT = {
  id: "evt_1",
  subject: "Weekly sync",
  start: { dateTime: "2026-03-02T10:00:00.0000000", timeZone: "UTC" },
  end: { dateTime: "2026-03-02T11:00:00.0000000", timeZone: "UTC" },
};

function parseEvent(raw: Record<string, unknown>) {
  const result = OutlookEventSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Event did not parse: ${result.error.message}`);
  }
  return result.data;
}

describe("OutlookEventSchema", () => {
  it("keeps categories, type and seriesMasterId from the Graph payload", () => {
    const event = parseEvent({
      ...BASE_EVENT,
      categories: ["Customer", "Hugues"],
      type: "occurrence",
      seriesMasterId: "evt_master",
    });

    expect(event.categories).toEqual(["Customer", "Hugues"]);
    expect(event.type).toBe("occurrence");
    expect(event.seriesMasterId).toBe("evt_master");
  });

  it("parses a non-recurring event, where Graph sends a null recurrence", () => {
    const event = parseEvent({
      ...BASE_EVENT,
      recurrence: null,
      type: "singleInstance",
    });

    expect(event.recurrence).toBeNull();
  });

  // These fields are only rendered, never branched on, so an unexpected shape
  // must cost us the field and nothing more. Without the `.catch`, one odd
  // event fails the whole `z.array(OutlookEventSchema)` parse in listEvents and
  // the tool returns no events at all.
  it.each([
    ["categories", { categories: "Customer" }],
    ["type", { type: 3 }],
    ["seriesMasterId", { seriesMasterId: 7 }],
    ["recurrence", { recurrence: "weekly" }],
    ["recurrence.pattern", { recurrence: { pattern: "weekly" } }],
    ["pattern.daysOfWeek", { recurrence: { pattern: { daysOfWeek: "mon" } } }],
  ])("drops %s rather than failing the event when Graph surprises us", (_label, patch) => {
    const event = parseEvent({ ...BASE_EVENT, ...patch });

    expect(event.id).toBe("evt_1");
    expect(event.subject).toBe("Weekly sync");
  });

  it("keeps the other events when one of them has a bad shape", () => {
    const result = z
      .array(OutlookEventSchema)
      .safeParse([
        BASE_EVENT,
        { ...BASE_EVENT, id: "evt_2", categories: "Customer" },
        { ...BASE_EVENT, id: "evt_3", categories: ["Customer"] },
      ]);

    expect(result.success).toBe(true);
    expect(result.data?.map((e) => e.id)).toEqual(["evt_1", "evt_2", "evt_3"]);
    expect(result.data?.[1].categories).toBeUndefined();
    expect(result.data?.[2].categories).toEqual(["Customer"]);
  });
});

describe("renderOutlookEvent", () => {
  it("renders categories", () => {
    const rendered = renderOutlookEvent(
      parseEvent({ ...BASE_EVENT, categories: ["Customer", "Hugues"] })
    );

    expect(rendered).toContain("Categories: Customer, Hugues");
  });

  it("renders the pattern and the series master of a recurring series", () => {
    const rendered = renderOutlookEvent(
      parseEvent({
        ...BASE_EVENT,
        type: "seriesMaster",
        recurrence: {
          pattern: { type: "weekly", interval: 2, daysOfWeek: ["monday"] },
          range: { type: "noEnd", startDate: "2026-03-02" },
        },
      })
    );

    expect(rendered).toContain(
      "Recurring: yes, series master - weekly (every 2) on monday"
    );
  });

  // Graph sends every pattern field whatever the type is, so the defaults it
  // fills in for the unused ones must not leak into the rendering.
  it.each([
    [
      "weekly ignores the index Graph defaults to",
      {
        type: "weekly",
        interval: 1,
        daysOfWeek: ["monday", "wednesday"],
        index: "first",
        dayOfMonth: 0,
        month: 0,
      },
      "weekly on monday, wednesday",
    ],
    [
      "relativeMonthly keeps the index that carries its meaning",
      {
        type: "relativeMonthly",
        interval: 3,
        daysOfWeek: ["thursday"],
        index: "second",
        dayOfMonth: 0,
      },
      "relativeMonthly (every 3) on the second thursday",
    ],
    [
      "absoluteMonthly names the day of month",
      { type: "absoluteMonthly", interval: 3, dayOfMonth: 15, month: 0 },
      "absoluteMonthly (every 3) on day 15",
    ],
    [
      "absoluteYearly names both day and month",
      { type: "absoluteYearly", interval: 1, dayOfMonth: 15, month: 3 },
      "absoluteYearly on day 15 of month 3",
    ],
    [
      "daily needs no day qualifier",
      { type: "daily", interval: 3, dayOfMonth: 0, month: 0 },
      "daily (every 3)",
    ],
  ])("%s", (_label, pattern, expected) => {
    const rendered = renderOutlookEvent(
      parseEvent({
        ...BASE_EVENT,
        type: "seriesMaster",
        recurrence: { pattern },
      })
    );

    expect(rendered).toContain(`Recurring: yes, series master - ${expected}`);
  });

  it("flags an occurrence as recurring even though it carries no pattern", () => {
    const rendered = renderOutlookEvent(
      parseEvent({
        ...BASE_EVENT,
        type: "occurrence",
        recurrence: null,
        seriesMasterId: "evt_master",
      })
    );

    expect(rendered).toContain("Recurring: yes, occurrence of a series");
    expect(rendered).toContain("Series Master Event ID: evt_master");
  });

  it("reports a single instance as not recurring", () => {
    const rendered = renderOutlookEvent(
      parseEvent({ ...BASE_EVENT, type: "singleInstance", recurrence: null })
    );

    expect(rendered).toContain("Recurring: no");
  });

  it("stays silent when Graph returns neither type nor recurrence", () => {
    const rendered = renderOutlookEvent(parseEvent(BASE_EVENT));

    expect(rendered).not.toContain("Recurring:");
    expect(rendered).not.toContain("Categories:");
    expect(rendered).not.toContain("Series Master Event ID:");
  });
});
