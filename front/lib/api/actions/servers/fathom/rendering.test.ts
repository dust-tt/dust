import type { EnrichedMeeting } from "@app/lib/api/actions/servers/fathom/rendering";
import {
  makeMeetingRecord,
  makeMeetingsListPayload,
  makeTranscriptPayload,
} from "@app/lib/api/actions/servers/fathom/rendering";
import { describe, expect, it } from "vitest";

function makeMeeting(
  overrides: Partial<EnrichedMeeting> = {}
): EnrichedMeeting {
  return {
    title: "Quarterly sync",
    meetingTitle: "Quarterly sync",
    recordingId: 12345,
    url: "https://fathom.video/calls/12345",
    shareUrl: "https://fathom.video/share/abc",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    scheduledStartTime: new Date("2026-08-01T10:00:00.000Z"),
    scheduledEndTime: new Date("2026-08-01T11:00:00.000Z"),
    recordingStartTime: new Date("2026-08-01T10:01:00.000Z"),
    recordingEndTime: new Date("2026-08-01T10:59:00.000Z"),
    calendarInviteesDomainsType: "only_internal",
    transcriptLanguage: "en",
    calendarInvitees: [
      {
        name: "Ada Lovelace",
        email: "ada@acme.com",
        emailDomain: "acme.com",
        isExternal: false,
      },
    ],
    recordedBy: {
      name: "Grace Hopper",
      email: "grace@acme.com",
      emailDomain: "acme.com",
      team: "Sales",
    },
    ...overrides,
  };
}

describe("makeMeetingRecord", () => {
  it("serializes dates as ISO 8601 strings and defaults optional fields to null", () => {
    const record = makeMeetingRecord(makeMeeting());

    expect(record).toEqual({
      recordingId: 12345,
      title: "Quarterly sync",
      meetingTitle: "Quarterly sync",
      url: "https://fathom.video/calls/12345",
      shareUrl: "https://fathom.video/share/abc",
      createdAt: "2026-08-01T10:00:00.000Z",
      scheduledStartTime: "2026-08-01T10:00:00.000Z",
      scheduledEndTime: "2026-08-01T11:00:00.000Z",
      recordingStartTime: "2026-08-01T10:01:00.000Z",
      recordingEndTime: "2026-08-01T10:59:00.000Z",
      transcriptLanguage: "en",
      recordedBy: {
        name: "Grace Hopper",
        email: "grace@acme.com",
        emailDomain: "acme.com",
        team: "Sales",
      },
      calendarInvitees: [
        {
          name: "Ada Lovelace",
          email: "ada@acme.com",
          emailDomain: "acme.com",
          isExternal: false,
        },
      ],
      actionItems: null,
      summary: null,
      crmMatches: null,
    });
  });

  it("falls back to the default summary when no fetched summary is present", () => {
    const record = makeMeetingRecord(
      makeMeeting({
        defaultSummary: { templateName: "General", markdownFormatted: "- ok" },
      })
    );

    expect(record.summary).toEqual({
      templateName: "General",
      markdownFormatted: "- ok",
    });
  });

  it("prefers the fetched summary over the default summary", () => {
    const record = makeMeetingRecord(
      makeMeeting({
        defaultSummary: { templateName: "General", markdownFormatted: "- ok" },
        fetchedSummary: {
          templateName: "Sales",
          markdownFormatted: "- detailed",
        },
      })
    );

    expect(record.summary).toEqual({
      templateName: "Sales",
      markdownFormatted: "- detailed",
    });
  });

  it("passes through action items and CRM matches", () => {
    const record = makeMeetingRecord(
      makeMeeting({
        actionItems: [
          {
            description: "Send the proposal",
            userGenerated: false,
            completed: false,
            recordingTimestamp: "00:12:34",
            recordingPlaybackUrl: "https://fathom.video/calls/12345?t=754",
            assignee: {
              name: "Ada Lovelace",
              email: "ada@acme.com",
              team: null,
            },
          },
        ],
        crmMatches: {
          contacts: [],
          companies: [
            { name: "Acme", recordUrl: "https://crm.example.com/acme" },
          ],
          deals: [],
        },
      })
    );

    expect(record.actionItems).toHaveLength(1);
    expect(record.actionItems?.[0].description).toBe("Send the proposal");
    expect(record.crmMatches?.companies).toEqual([
      { name: "Acme", recordUrl: "https://crm.example.com/acme" },
    ]);
  });
});

describe("makeMeetingsListPayload", () => {
  it("wraps meeting records with the pagination cursor", () => {
    const payload = makeMeetingsListPayload({
      meetings: [makeMeeting()],
      nextCursor: "cursor-123",
    });

    expect(payload.meetings).toHaveLength(1);
    expect(payload.meetings[0].recordingId).toBe(12345);
    expect(payload.nextCursor).toBe("cursor-123");
  });

  it("returns a null cursor on the last page", () => {
    const payload = makeMeetingsListPayload({
      meetings: [],
      nextCursor: null,
    });

    expect(payload).toEqual({ meetings: [], nextCursor: null });
  });
});

describe("makeTranscriptPayload", () => {
  it("flattens transcript items into timestamp/speaker/text records", () => {
    const payload = makeTranscriptPayload({
      recordingId: 12345,
      transcript: [
        {
          speaker: { displayName: "Grace Hopper" },
          text: "Hello everyone.",
          timestamp: "00:00:05",
        },
        {
          speaker: { displayName: "Ada Lovelace" },
          text: "Hi Grace.",
          timestamp: "00:00:09",
        },
      ],
    });

    expect(payload).toEqual({
      recordingId: 12345,
      transcript: [
        {
          timestamp: "00:00:05",
          speaker: "Grace Hopper",
          text: "Hello everyone.",
        },
        { timestamp: "00:00:09", speaker: "Ada Lovelace", text: "Hi Grace." },
      ],
    });
  });
});
