import {
  MAX_NUMBER_OF_MESSAGES,
  shouldContinuePagination,
} from "@app/lib/api/actions/servers/microsoft_teams/tools/pagination";
import { describe, expect, it } from "vitest";

// Graph returns messages newest-first, so a "page" here is ordered newest to
// oldest; the last element is the oldest on the page. Both timestamps are set
// equal — the case that distinguishes them builds its message inline.
function page(...isoDates: string[]) {
  return isoDates.map((value) => ({
    createdDateTime: value,
    lastModifiedDateTime: value,
  }));
}

describe("shouldContinuePagination", () => {
  const fromDateTime = new Date("2026-04-01T00:00:00.000Z");

  it("continues when the oldest message on the page is still within the range", () => {
    // Oldest message (last element) is after fromDate, so older in-range
    // messages may still be on later pages.
    expect(
      shouldContinuePagination({
        pageMessages: page(
          "2026-05-10T00:00:00.000Z",
          "2026-04-15T00:00:00.000Z"
        ),
        fromDateTime,
        collectedCount: 2,
        orderingField: "createdDateTime",
      })
    ).toBe(true);
  });

  it("stops once the oldest message on the page is older than fromDate", () => {
    // Last element predates fromDate: every later (older) page is out of range.
    expect(
      shouldContinuePagination({
        pageMessages: page(
          "2026-04-15T00:00:00.000Z",
          "2026-03-20T00:00:00.000Z"
        ),
        fromDateTime,
        collectedCount: 1,
        orderingField: "createdDateTime",
      })
    ).toBe(false);
  });

  it("keeps paging when the whole page is newer than the range (toDate in the past)", () => {
    // The regression: with a past toDate, page 1 is entirely newer than the
    // window, nothing matches, yet we must keep walking back to reach it.
    expect(
      shouldContinuePagination({
        pageMessages: page(
          "2026-06-20T00:00:00.000Z",
          "2026-06-10T00:00:00.000Z"
        ),
        fromDateTime,
        collectedCount: 0,
        orderingField: "createdDateTime",
      })
    ).toBe(true);
  });

  it("pages until the message limit when there is no lower bound", () => {
    expect(
      shouldContinuePagination({
        pageMessages: page("2020-01-01T00:00:00.000Z"),
        fromDateTime: null,
        collectedCount: 5,
        orderingField: "createdDateTime",
      })
    ).toBe(true);
  });

  it("stops as soon as the message limit is reached, regardless of dates", () => {
    expect(
      shouldContinuePagination({
        pageMessages: page("2026-05-01T00:00:00.000Z"),
        fromDateTime,
        collectedCount: MAX_NUMBER_OF_MESSAGES,
        orderingField: "createdDateTime",
      })
    ).toBe(false);
  });

  it("continues on an empty page when under the limit", () => {
    // A server-side filter can match nothing on a given skiptoken page.
    expect(
      shouldContinuePagination({
        pageMessages: [],
        fromDateTime,
        collectedCount: 0,
        orderingField: "createdDateTime",
      })
    ).toBe(true);

    expect(
      shouldContinuePagination({
        pageMessages: undefined,
        fromDateTime,
        collectedCount: 0,
        orderingField: "createdDateTime",
      })
    ).toBe(true);
  });

  it("compares the ordering field, not the other timestamp", () => {
    // Channel page ordered by lastModifiedDateTime. The oldest message was
    // created long before fromDate but edited recently (recent
    // lastModifiedDateTime). Stopping must key off the ordering field
    // (lastModifiedDateTime), so we keep paging — a naive createdDateTime stop
    // would halt too early and drop in-range messages on later pages.
    const message = {
      createdDateTime: "2026-01-01T00:00:00.000Z",
      lastModifiedDateTime: "2026-05-01T00:00:00.000Z",
    };
    expect(
      shouldContinuePagination({
        pageMessages: [message],
        fromDateTime,
        collectedCount: 0,
        orderingField: "lastModifiedDateTime",
      })
    ).toBe(true);
  });
});
