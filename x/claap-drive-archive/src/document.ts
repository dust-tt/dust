import { archiveDatePrefix } from "./filenames.ts";
import type { ClaapPerson, ClaapRecording, ClaapTranscript } from "./types.ts";
import { yamlScalar } from "./yaml.ts";

function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00:00";
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return [hours, minutes, rest].map((part) => String(part).padStart(2, "0")).join(":");
}

function personLine(person: ClaapPerson, indent = "  "): string[] {
  const lines = [`${indent}- name: ${yamlScalar(person.name ?? "")}`];
  if (person.email) {
    lines.push(`${indent}  email: ${yamlScalar(person.email)}`);
  }
  lines.push(`${indent}  attended: ${yamlScalar(person.attended)}`);
  return lines;
}

export function buildFrontmatter(recording: ClaapRecording): string {
  const participants = recording.meeting?.participants ?? [];
  const companies = recording.companies ?? [];
  const labels = recording.labels ?? [];

  const lines = [
    `claap_id: ${yamlScalar(recording.id)}`,
    `title: ${yamlScalar(recording.title ?? "")}`,
    `created_at: ${yamlScalar(recording.createdAt)}`,
    `date: ${yamlScalar(archiveDatePrefix(recording.createdAt))}`,
    `duration_seconds: ${yamlScalar(recording.durationSeconds ?? null)}`,
    `source: ${yamlScalar(recording.source ?? null)}`,
    `meeting_type: ${yamlScalar(recording.meeting?.type ?? null)}`,
    `conference_url: ${yamlScalar(recording.meeting?.conferenceUrl ?? null)}`,
    `meeting_starting_at: ${yamlScalar(recording.meeting?.startingAt ?? null)}`,
    `meeting_ending_at: ${yamlScalar(recording.meeting?.endingAt ?? null)}`,
    `recorder_name: ${yamlScalar(recording.recorder.name)}`,
    `recorder_email: ${yamlScalar(recording.recorder.email)}`,
    `recorder_attended: ${yamlScalar(recording.recorder.attended)}`,
    "participants:",
    ...(participants.length > 0
      ? participants.flatMap((person) => personLine(person))
      : ["  []"]),
    "companies:",
    ...(companies.length > 0
      ? companies.map((company) => `  - ${yamlScalar(company.name)}`)
      : ["  []"]),
    `deal: ${yamlScalar(recording.deal?.name ?? recording.deal?.id ?? null)}`,
    `crm: ${yamlScalar(recording.crmInfo?.crm ?? null)}`,
    `channel: ${yamlScalar(recording.channel?.name ?? null)}`,
    "labels:",
    ...(labels.length > 0
      ? labels.map((label) => `  - ${yamlScalar(label)}`)
      : ["  []"]),
    `workspace: ${yamlScalar(recording.workspace.name)}`,
    `claap_url: ${yamlScalar(recording.url)}`,
    `transcript_only: ${yamlScalar(Boolean(recording.transcriptOnly))}`,
    `video_available: ${yamlScalar(Boolean(recording.video?.url) && !recording.transcriptOnly)}`,
  ];

  return `---\n${lines.join("\n")}\n---\n`;
}

export function formatTranscript(
  transcript: ClaapTranscript | null,
  fallbackText?: string | null
): string {
  if (transcript && transcript.segments.length > 0) {
    return transcript.segments
      .map((segment) => {
        const speaker = segment.speaker?.trim() || "unknown";
        const text = segment.text.trim();
        return `[${formatTimestamp(segment.startedAt)}] ${speaker}: ${text}`;
      })
      .join("\n");
  }

  if (fallbackText?.trim()) {
    return fallbackText.trim();
  }

  return "_No transcript was available for this recording._";
}

export function buildArchiveMarkdown(input: {
  recording: ClaapRecording;
  transcript: ClaapTranscript | null;
  fallbackText?: string | null;
}): string {
  const frontmatter = buildFrontmatter(input.recording);
  const transcript = formatTranscript(input.transcript, input.fallbackText);
  return `${frontmatter}\n# Transcript\n\n${transcript}\n`;
}

export function buildArchiveJson(input: {
  recording: ClaapRecording;
  transcript: ClaapTranscript | null;
}): string {
  return `${JSON.stringify(
    {
      archivedAt: new Date().toISOString(),
      recording: input.recording,
      transcript: input.transcript,
    },
    null,
    2
  )}\n`;
}
