import { describe, expect, it } from "vitest";

import type { EnrichedGoogleCalendarEvent } from "@app/lib/api/actions/servers/google_calendar/helpers";
import { formatEventAsText } from "@app/lib/api/actions/servers/google_calendar/helpers";

describe("formatEventAsText - attachments", () => {
  it("surfaces attachment title, mime type and file URL", () => {
    const event: EnrichedGoogleCalendarEvent = {
      summary: "Weekly 1:1",
      attachments: [
        {
          fileUrl: "https://docs.google.com/document/d/abc123/edit",
          title: "1:1 Rolling Notes",
          mimeType: "application/vnd.google-apps.document",
          fileId: "abc123",
        },
      ],
    };

    const text = formatEventAsText(event);

    expect(text).toContain(
      "Attachments: 1:1 Rolling Notes [application/vnd.google-apps.document]: https://docs.google.com/document/d/abc123/edit"
    );
  });

  it("lists multiple attachments separated by commas", () => {
    const event: EnrichedGoogleCalendarEvent = {
      summary: "Comex",
      attachments: [
        { fileUrl: "https://drive.google.com/file/1", title: "Agenda" },
        { fileUrl: "https://drive.google.com/file/2", title: "Notes" },
      ],
    };

    const text = formatEventAsText(event);

    expect(text).toContain(
      "Attachments: Agenda: https://drive.google.com/file/1, Notes: https://drive.google.com/file/2"
    );
  });

  it("ignores attachments without a file URL", () => {
    const event: EnrichedGoogleCalendarEvent = {
      summary: "No links",
      attachments: [{ title: "Broken attachment" }],
    };

    const text = formatEventAsText(event);

    expect(text).not.toContain("Attachments:");
  });

  it("does not emit an attachments line when there are none", () => {
    const event: EnrichedGoogleCalendarEvent = {
      summary: "Plain event",
    };

    const text = formatEventAsText(event);

    expect(text).not.toContain("Attachments:");
  });
});
