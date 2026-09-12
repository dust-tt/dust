import { google } from "googleapis";

const CLAAP_API = "https://api.claap.io";
const FOLDER_MIME = "application/vnd.google-apps.folder";

function yamlScalar(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (
    value === "" ||
    value === "true" ||
    value === "false" ||
    value === "null" ||
    /[:#\n\r"'{}[\]&*?|<>=!%`,]/.test(value) ||
    /\s/.test(value) ||
    /^-/.test(value)
  ) {
    return JSON.stringify(value);
  }
  return value;
}

function sanitizeFilenamePart(value) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.length > 0 ? cleaned : "untitled";
}

function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return [hours, minutes, rest].map((part) => String(part).padStart(2, "0")).join(":");
}

function escapeDriveQuery(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function personLines(person, indent = "  ") {
  const lines = [`${indent}- name: ${yamlScalar(person?.name ?? "")}`];
  if (person?.email) {
    lines.push(`${indent}  email: ${yamlScalar(person.email)}`);
  }
  lines.push(`${indent}  attended: ${yamlScalar(Boolean(person?.attended))}`);
  return lines;
}

function buildMarkdown(recording, transcript) {
  const participants = recording.meeting?.participants ?? [];
  const companies = recording.companies ?? [];
  const labels = recording.labels ?? [];
  const date = String(recording.createdAt || "").slice(0, 10);
  const frontmatter = [
    `claap_id: ${yamlScalar(recording.id)}`,
    `title: ${yamlScalar(recording.title ?? "")}`,
    `created_at: ${yamlScalar(recording.createdAt)}`,
    `date: ${yamlScalar(date)}`,
    `duration_seconds: ${yamlScalar(recording.durationSeconds ?? null)}`,
    `source: ${yamlScalar(recording.source ?? null)}`,
    `meeting_type: ${yamlScalar(recording.meeting?.type ?? null)}`,
    `conference_url: ${yamlScalar(recording.meeting?.conferenceUrl ?? null)}`,
    `meeting_starting_at: ${yamlScalar(recording.meeting?.startingAt ?? null)}`,
    `meeting_ending_at: ${yamlScalar(recording.meeting?.endingAt ?? null)}`,
    `recorder_name: ${yamlScalar(recording.recorder?.name ?? "")}`,
    `recorder_email: ${yamlScalar(recording.recorder?.email ?? "")}`,
    `recorder_attended: ${yamlScalar(Boolean(recording.recorder?.attended))}`,
    "participants:",
    ...(participants.length ? participants.flatMap((person) => personLines(person)) : ["  []"]),
    "companies:",
    ...(companies.length ? companies.map((company) => `  - ${yamlScalar(company.name)}`) : ["  []"]),
    `deal: ${yamlScalar(recording.deal?.name ?? recording.deal?.id ?? null)}`,
    `crm: ${yamlScalar(recording.crmInfo?.crm ?? null)}`,
    `channel: ${yamlScalar(recording.channel?.name ?? null)}`,
    "labels:",
    ...(labels.length ? labels.map((label) => `  - ${yamlScalar(label)}`) : ["  []"]),
    `workspace: ${yamlScalar(recording.workspace?.name ?? "")}`,
    `claap_url: ${yamlScalar(recording.url)}`,
    `transcript_only: ${yamlScalar(Boolean(recording.transcriptOnly))}`,
    `video_available: ${yamlScalar(Boolean(recording.video?.url) && !recording.transcriptOnly)}`,
  ];
  const body =
    transcript?.segments?.length > 0
      ? transcript.segments
          .map((segment) => {
            const speaker = segment.speaker?.trim() || "unknown";
            return `[${formatTimestamp(segment.startedAt)}] ${speaker}: ${String(segment.text || "").trim()}`;
          })
          .join("\n")
      : "_No transcript was available for this recording._";
  return `---\n${frontmatter.join("\n")}\n---\n\n# Transcript\n\n${body}\n`;
}

function archiveBaseName(recording) {
  const date = String(recording.createdAt || "").slice(0, 10);
  const title = sanitizeFilenamePart(recording.title || "untitled").slice(0, 80);
  return `${date}_${title}_${recording.id}`;
}

async function claapGet(apiKey, path) {
  const res = await fetch(`${CLAAP_API}/${path}`, {
    headers: { Accept: "application/json", "X-Claap-Key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`Claap ${res.status} ${path}: ${await res.text()}`);
  }
  return res.json();
}

function driveClient(accessToken) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

async function findFile(drive, query) {
  const response = await drive.files.list({
    q: query,
    fields: "files(id,name)",
    pageSize: 1,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return response.data.files?.[0] ?? null;
}

async function ensureFolder(drive, parentId, name) {
  const existing = await findFile(
    drive,
    `mimeType = '${FOLDER_MIME}' and name = '${escapeDriveQuery(name)}' and '${escapeDriveQuery(parentId)}' in parents and trashed = false`
  );
  if (existing?.id) {
    return existing.id;
  }
  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  return created.data.id;
}

async function upsertFile(drive, { parentId, name, mimeType, content, kind, recordingId }) {
  const existing = await findFile(
    drive,
    `appProperties has { key='claapRecordingId' and value='${escapeDriveQuery(recordingId)}' } and appProperties has { key='kind' and value='${escapeDriveQuery(kind)}' } and '${escapeDriveQuery(parentId)}' in parents and trashed = false`
  );
  const media = { mimeType, body: content };
  const requestBody = { name, appProperties: { claapRecordingId: recordingId, kind } };
  if (existing?.id) {
    return (
      await drive.files.update({
        fileId: existing.id,
        requestBody,
        media,
        fields: "id",
        supportsAllDrives: true,
      })
    ).data;
  }
  return (
    await drive.files.create({
      requestBody: { ...requestBody, mimeType, parents: [parentId] },
      media,
      fields: "id",
      supportsAllDrives: true,
    })
  ).data;
}

async function archiveOne(apiKey, drive, recordingId, rootFolderId) {
  const recording = (await claapGet(apiKey, `v1/recordings/${encodeURIComponent(recordingId)}`))
    .result.recording;
  if (recording.state !== "Ready") {
    return { status: "skipped", recordingId, reason: recording.state };
  }
  let transcript = null;
  try {
    transcript = (
      await claapGet(apiKey, `v1/recordings/${encodeURIComponent(recordingId)}/transcript?format=json`)
    ).result.transcript;
  } catch (error) {
    console.warn(`Transcript missing for ${recordingId}`, error);
  }
  const folderId = await ensureFolder(
    drive,
    rootFolderId,
    sanitizeFilenamePart(recording.recorder?.email?.toLowerCase() || "_unknown")
  );
  const baseName = archiveBaseName(recording);
  await upsertFile(drive, {
    parentId: folderId,
    name: `${baseName}.md`,
    mimeType: "text/markdown",
    content: buildMarkdown(recording, transcript),
    kind: "transcript",
    recordingId,
  });
  await upsertFile(drive, {
    parentId: folderId,
    name: `${baseName}.json`,
    mimeType: "application/json",
    content: `${JSON.stringify({ archivedAt: new Date().toISOString(), recording, transcript }, null, 2)}\n`,
    kind: "raw",
    recordingId,
  });
  return { status: "archived", recordingId, folderId };
}

export default defineComponent({
  name: "Backfill Claap recordings to Google Drive",
  description: "Re-archives recent Claap recordings. Safe to rerun; files upsert by recording id.",
  props: {
    googleDrive: {
      type: "app",
      app: "google_drive",
    },
    claapApiKey: {
      type: "string",
      label: "Claap API key",
      secret: true,
    },
    rootFolderId: {
      type: "string",
      label: "Google Drive root folder ID",
    },
    lookbackHours: {
      type: "integer",
      label: "Lookback hours",
      default: 48,
    },
  },
  async run({ $ }) {
    const createdAfter = new Date(Date.now() - this.lookbackHours * 60 * 60 * 1000).toISOString();
    const drive = driveClient(this.googleDrive.$auth.oauth_access_token);
    const results = [];
    let cursor;

    do {
      const params = new URLSearchParams({
        createdAfter,
        limit: "50",
        sort: "created_asc",
      });
      if (cursor) {
        params.set("cursor", cursor);
      }
      const page = await claapGet(this.claapApiKey, `v1/recordings?${params.toString()}`);
      for (const recording of page.result.recordings) {
        results.push(await archiveOne(this.claapApiKey, drive, recording.id, this.rootFolderId));
      }
      cursor = page.result.pagination?.nextCursor;
    } while (cursor);

    const archived = results.filter((result) => result.status === "archived").length;
    $.export("summary", `Archived ${archived} / ${results.length} recordings since ${createdAfter}`);
    return { createdAfter, archived, results };
  },
});
