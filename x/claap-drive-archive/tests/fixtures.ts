import type { ClaapRecording, ClaapTranscript } from "../src/types.ts";

export function makeRecording(
  overrides: Partial<ClaapRecording> = {}
): ClaapRecording {
  return {
    id: "rec_abc123",
    state: "Ready",
    title: "Discovery call with Acme / Q3",
    createdAt: "2026-09-12T15:04:05.000Z",
    durationSeconds: 1842,
    source: "GoogleMeet",
    url: "https://app.claap.io/dust/discovery-call-with-acme-rec_abc123",
    transcriptOnly: false,
    labels: ["customer"],
    recorder: {
      attended: true,
      email: "ilias@dust.tt",
      id: "user_1",
      name: "Ilias Bettaieb",
    },
    channel: { id: "ch_ext", name: "External" },
    workspace: { id: "ws_dust", name: "Dust" },
    meeting: {
      conferenceUrl: "https://meet.google.com/aaa-bbbb-cccc",
      startingAt: "2026-09-12T14:30:00.000Z",
      endingAt: "2026-09-12T15:00:00.000Z",
      type: "external",
      participants: [
        {
          attended: true,
          email: "jane@acme.com",
          name: "Jane Doe",
        },
        {
          attended: true,
          email: "ilias@dust.tt",
          name: "Ilias Bettaieb",
        },
      ],
    },
    companies: [{ id: "co_1", name: "Acme" }],
    deal: { id: "deal_1", name: "Acme — Enterprise" },
    crmInfo: { crm: "hubspot", deal: { id: "hs_1" } },
    video: { url: "https://cdn.claap.io/video/rec_abc123.mp4?token=tmp" },
    transcripts: [
      {
        isActive: true,
        isTranscript: true,
        langIso2: "en",
        textUrl: "https://cdn.claap.io/transcript.txt",
        url: "https://cdn.claap.io/transcript.json",
      },
    ],
    aiFields: [{ title: "MEDICC", description: "Do not put this in the markdown." }],
    keyTakeaways: [{ langIso2: "en", text: "Generated notes must stay out." }],
    outlines: [{ langIso2: "en", text: "Outline" }],
    ...overrides,
  };
}

export function makeTranscript(): ClaapTranscript {
  return {
    languageCode: "en",
    segments: [
      {
        startedAt: 136.1,
        endedAt: 137.5,
        speaker: "speaker_1",
        text: "Hello there!",
        languageCode: "en",
      },
      {
        startedAt: 138.2,
        endedAt: 141.0,
        speaker: "speaker_2",
        text: "Thanks for joining.",
        languageCode: "en",
      },
    ],
  };
}
