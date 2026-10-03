import type {
  ActionItem,
  CRMMatches,
  FathomUser,
  Invitee,
  Meeting,
  MeetingSummary,
  TranscriptItem,
} from "fathom-typescript/sdk/models/shared";

export type EnrichedMeeting = Meeting & {
  fetchedSummary?: MeetingSummary | null;
};

// Stable machine-readable shapes emitted as a JSON content block alongside the human-readable
// rendering, so programmatic consumers do not have to parse prose. Dates are ISO 8601 strings.

export interface FathomMeetingRecord {
  recordingId: number;
  title: string;
  meetingTitle: string | null;
  url: string;
  shareUrl: string;
  createdAt: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  recordingStartTime: string;
  recordingEndTime: string;
  transcriptLanguage: string;
  recordedBy: FathomUser;
  calendarInvitees: Invitee[];
  actionItems: ActionItem[] | null;
  summary: MeetingSummary | null;
  crmMatches: CRMMatches | null;
}

export interface FathomMeetingsListPayload {
  meetings: FathomMeetingRecord[];
  nextCursor: string | null;
}

export function makeMeetingRecord(
  meeting: EnrichedMeeting
): FathomMeetingRecord {
  return {
    recordingId: meeting.recordingId,
    title: meeting.title,
    meetingTitle: meeting.meetingTitle,
    url: meeting.url,
    shareUrl: meeting.shareUrl,
    createdAt: meeting.createdAt.toISOString(),
    scheduledStartTime: meeting.scheduledStartTime.toISOString(),
    scheduledEndTime: meeting.scheduledEndTime.toISOString(),
    recordingStartTime: meeting.recordingStartTime.toISOString(),
    recordingEndTime: meeting.recordingEndTime.toISOString(),
    transcriptLanguage: meeting.transcriptLanguage,
    recordedBy: meeting.recordedBy,
    calendarInvitees: meeting.calendarInvitees,
    actionItems: meeting.actionItems ?? null,
    summary: meeting.fetchedSummary ?? meeting.defaultSummary ?? null,
    crmMatches: meeting.crmMatches ?? null,
  };
}

export function makeMeetingsListPayload({
  meetings,
  nextCursor,
}: {
  meetings: EnrichedMeeting[];
  nextCursor: string | null;
}): FathomMeetingsListPayload {
  return {
    meetings: meetings.map(makeMeetingRecord),
    nextCursor,
  };
}

export interface FathomTranscriptPayload {
  recordingId: number;
  transcript: {
    timestamp: string;
    speaker: string;
    text: string;
  }[];
}

export function makeTranscriptPayload({
  recordingId,
  transcript,
}: {
  recordingId: number;
  transcript: TranscriptItem[];
}): FathomTranscriptPayload {
  return {
    recordingId,
    transcript: transcript.map((item) => ({
      timestamp: item.timestamp,
      speaker: item.speaker.displayName,
      text: item.text,
    })),
  };
}
