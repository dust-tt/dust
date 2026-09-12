import { timingSafeEqual } from "crypto";
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

function verifySecret(provided, expected) {
  if (!expected || !provided) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function extractRecordingId(body) {
  return body?.event?.recording?.id || body?.recording?.id || body?.recordingId || null;
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
  const response = await fetch(`${CLAAP_API}/${path}`, {
    headers: {
      Accept: "application/json",
      "X-Claap-Key": apiKey,
    },
  });
  if (!response.ok) {
    throw new Error(`Claap ${response.status} ${path}: ${await response.text()}`);
  }
  return response.json();
}

function driveClient(accessToken) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

async function findFile(drive, query) {
  const response = await drive.files.list({
    q: query,
    fields: "files(id,name,webViewLink)",
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
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    },
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
    const updated = await drive.files.update({
      fileId: existing.id,
      requestBody,
      media,
      fields: "id,webViewLink",
      supportsAllDrives: true,
    });
    return updated.data;
  }
  const created = await drive.files.create({
    requestBody: { ...requestBody, mimeType, parents: [parentId] },
    media,
    fields: "id,webViewLink",
    supportsAllDrives: true,
  });
  return created.data;
}

export default defineComponent({
  name: "Archive Claap recording to Google Drive",
  description:
    "Stores raw Claap transcript + metadata JSON in a per-user Google Drive folder. Does not write AI notes.",
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
    claapWebhookSecret: {
      type: "string",
      label: "Claap webhook secret",
      secret: true,
    },
    rootFolderId: {
      type: "string",
      label: "Google Drive root folder ID",
      description: "Shared Drive folder that will contain one subfolder per recorder email.",
    },
    uploadVideo: {
      type: "boolean",
      label: "Upload video files",
      default: false,
    },
    maxVideoBytes: {
      type: "integer",
      label: "Max video size in bytes",
      default: 209715200,
    },
  },
  async run({ steps, $ }) {
    const headers = steps.trigger.event.headers || {};
    const providedSecret = headers["x-claap-webhook-secret"];
    if (!verifySecret(providedSecret, this.claapWebhookSecret)) {
      await $.respond({
        status: 401,
        body: { ok: false, error: "invalid webhook secret" },
      });
      return { skipped: true, reason: "invalid webhook secret" };
    }

    const recordingId = extractRecordingId(steps.trigger.event.body);
    if (!recordingId) {
      await $.respond({
        status: 400,
        body: { ok: false, error: "missing recording id" },
      });
      return { skipped: true, reason: "missing recording id" };
    }

    // Claap requires HTTP 200 within 5 seconds. Ack first; Drive writes are idempotent
    // and the scheduled backfill workflow catches failures.
    await $.respond({
      status: 200,
      body: { ok: true, recordingId },
    });

    const recording = (await claapGet(this.claapApiKey, `v1/recordings/${encodeURIComponent(recordingId)}`))
      .result.recording;
    if (recording.state !== "Ready") {
      return { skipped: true, recordingId, reason: `state ${recording.state}` };
    }

    let transcript = null;
    try {
      transcript = (
        await claapGet(
          this.claapApiKey,
          `v1/recordings/${encodeURIComponent(recordingId)}/transcript?format=json`
        )
      ).result.transcript;
    } catch (error) {
      console.warn("Transcript fetch failed; writing metadata only", error);
    }

    const drive = driveClient(this.googleDrive.$auth.oauth_access_token);
    const recorderFolder = sanitizeFilenamePart(recording.recorder?.email?.toLowerCase() || "_unknown");
    const folderId = await ensureFolder(drive, this.rootFolderId, recorderFolder);
    const baseName = archiveBaseName(recording);

    const markdownFile = await upsertFile(drive, {
      parentId: folderId,
      name: `${baseName}.md`,
      mimeType: "text/markdown",
      content: buildMarkdown(recording, transcript),
      kind: "transcript",
      recordingId,
    });
    const jsonFile = await upsertFile(drive, {
      parentId: folderId,
      name: `${baseName}.json`,
      mimeType: "application/json",
      content: `${JSON.stringify({ archivedAt: new Date().toISOString(), recording, transcript }, null, 2)}\n`,
      kind: "raw",
      recordingId,
    });

    let videoFile = null;
    if (this.uploadVideo && recording.video?.url && !recording.transcriptOnly) {
      const videoResponse = await fetch(recording.video.url);
      if (videoResponse.ok) {
        const bytes = Buffer.from(await videoResponse.arrayBuffer());
        if (bytes.byteLength > 0 && bytes.byteLength <= this.maxVideoBytes) {
          videoFile = await upsertFile(drive, {
            parentId: folderId,
            name: `${baseName}.mp4`,
            mimeType: videoResponse.headers.get("content-type") || "video/mp4",
            content: bytes,
            kind: "video",
            recordingId,
          });
        }
      }
    }

    return {
      recordingId,
      folderId,
      markdownFile,
      jsonFile,
      videoFile,
    };
  },
});
