import { describe, expect, it } from "vitest";

import { renderOutlookEvent } from "./rendering";

function makeEvent(timeZone: string) {
  return {
    id: "event-1",
    subject: "Weekly sync",
    start: { dateTime: "2026-10-06T16:00:00.0000000", timeZone },
    end: { dateTime: "2026-10-06T17:00:00.0000000", timeZone },
  };
}

describe("renderOutlookEvent", () => {
  it("resolves Windows time zone names to their IANA zone", () => {
    const rendered = renderOutlookEvent(
      makeEvent("Romance Standard Time"),
      "Romance Standard Time"
    );

    expect(rendered).toContain(
      "Start: Tuesday, October 6, 2026 at 4:00 PM (Europe/Paris)"
    );
    expect(rendered).toContain(
      "End: Tuesday, October 6, 2026 at 5:00 PM (Europe/Paris)"
    );
  });

  it("converts a UTC event into the user's Windows time zone", () => {
    const rendered = renderOutlookEvent(
      makeEvent("UTC"),
      "Romance Standard Time"
    );

    expect(rendered).toContain(
      "Start: Tuesday, October 6, 2026 at 6:00 PM (Europe/Paris)"
    );
  });

  it("falls back to UTC for unknown time zone names", () => {
    const rendered = renderOutlookEvent(makeEvent("Not A Zone"));

    expect(rendered).toContain(
      "Start: Tuesday, October 6, 2026 at 4:00 PM (UTC)"
    );
  });
});
