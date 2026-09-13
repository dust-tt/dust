const CLAAP = "https://api.claap.io";
const FOLDER = "application/vnd.google-apps.folder";

function slug(value) {
  return (
    String(value || "untitled")
      .normalize("NFKD")
      .replace(/[\u0000-\u001f]/g, "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

function esc(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function ts(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function markdown(recording, transcript) {
  const date = String(recording.createdAt || "").slice(0, 10);
  const body = transcript?.segments?.length
    ? transcript.segments
        .map((segment) => {
          const speaker = (segment.speaker || "unknown").trim();
          return `[${ts(segment.startedAt)}] ${speaker}: ${String(segment.text || "").trim()}`;
        })
        .join("\n")
    : "_No transcript was available for this recording._";
  const yaml = [
    `claap_id: ${JSON.stringify(recording.id)}`,
    `title: ${JSON.stringify(recording.title ?? "")}`,
    `created_at: ${JSON.stringify(recording.createdAt ?? null)}`,
    `date: ${JSON.stringify(date)}`,
    `duration_seconds: ${recording.durationSeconds ?? "null"}`,
    `source: ${JSON.stringify(recording.source ?? null)}`,
    `conference_url: ${JSON.stringify(recording.meeting?.conferenceUrl ?? null)}`,
    `recorder_name: ${JSON.stringify(recording.recorder?.name ?? "")}`,
    `recorder_email: ${JSON.stringify(recording.recorder?.email ?? "")}`,
    `workspace: ${JSON.stringify(recording.workspace?.name ?? "")}`,
    `claap_url: ${JSON.stringify(recording.url ?? null)}`,
  ].join("\n");
  return `---\n${yaml}\n---\n\n# Transcript\n\n${body}\n`;
}

async function claapGet(apiKey, path) {
  const response = await fetch(`${CLAAP}/${path}`, {
    headers: { Accept: "application/json", "X-Claap-Key": apiKey },
  });
  if (!response.ok) {
    throw new Error(`Claap ${response.status} ${path}: ${await response.text()}`);
  }
  return response.json();
}

async function driveJson(token, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!response.ok) {
    throw new Error(`Drive ${response.status}: ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

async function findFile(token, query) {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("supportsAllDrives", "true");
  return (await driveJson(token, url)).files?.[0] ?? null;
}

async function ensureFolder(token, parentId, name) {
  const existing = await findFile(
    token,
    `mimeType='${FOLDER}' and name='${esc(name)}' and '${esc(parentId)}' in parents and trashed=false`
  );
  if (existing?.id) {
    return existing.id;
  }
  const created = await driveJson(token, "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  });
  return created.id;
}

async function upsertFile(token, { parentId, name, mimeType, content, kind, recordingId }) {
  const existing = await findFile(
    token,
    `appProperties has { key='claapRecordingId' and value='${esc(recordingId)}' } and appProperties has { key='kind' and value='${esc(kind)}' } and '${esc(parentId)}' in parents and trashed=false`
  );
  const meta = { name, appProperties: { claapRecordingId: recordingId, kind } };
  const boundary = "claaparchive";
  const metadata = existing ? meta : { ...meta, mimeType, parents: [parentId] };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n--${boundary}--`;
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&supportsAllDrives=true`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";
  return driveJson(token, url, {
    method: existing ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
}

async function resolveRecordingId(apiKey, recordingId) {
  try {
    await claapGet(apiKey, `v1/recordings/${encodeURIComponent(recordingId)}`);
    return recordingId;
  } catch (error) {
    if (!String(error.message).includes(" 404 ")) {
      throw error;
    }
    const page = await claapGet(apiKey, "v1/recordings?limit=50&sort=created_desc");
    const recordings = page.result.recordings || [];
    const suffix = recordingId.includes("-") ? recordingId.split("-").pop() : recordingId;
    const hit = recordings.find(
      (recording) =>
        recording.id === recordingId ||
        recording.id === suffix ||
        recordingId.endsWith(recording.id) ||
        recording.url?.includes(recordingId) ||
        recording.url?.endsWith(recording.id)
    );
    if (hit) {
      return hit.id;
    }
    const listed = recordings.map((recording) => `${recording.id} ${recording.url || ""}`).join("; ");
    throw new Error(`Claap recording not found: ${recordingId}. Listed ${recordings.length}: ${listed}`);
  }
}

async function archiveOne(apiKey, token, rootFolderId, recordingId) {
  recordingId = await resolveRecordingId(apiKey, recordingId);
  const recording = (await claapGet(apiKey, `v1/recordings/${encodeURIComponent(recordingId)}`)).result
    .recording;
  if (recording.state !== "Ready") {
    return { status: "skipped", recordingId, reason: recording.state };
  }
  let transcript = null;
  try {
    transcript = (
      await claapGet(apiKey, `v1/recordings/${encodeURIComponent(recordingId)}/transcript?format=json`)
    ).result.transcript;
  } catch (error) {
    console.warn("Transcript missing", error);
  }
  const folderId = await ensureFolder(
    token,
    rootFolderId,
    slug((recording.recorder?.email || "_unknown").toLowerCase())
  );
  const base = `${String(recording.createdAt || "").slice(0, 10)}_${slug(recording.title).slice(0, 80)}_${recording.id}`;
  await upsertFile(token, {
    parentId: folderId,
    name: `${base}.md`,
    mimeType: "text/markdown",
    content: markdown(recording, transcript),
    kind: "transcript",
    recordingId,
  });
  await upsertFile(token, {
    parentId: folderId,
    name: `${base}.json`,
    mimeType: "application/json",
    content: `${JSON.stringify({ archivedAt: new Date().toISOString(), recording, transcript }, null, 2)}\n`,
    kind: "raw",
    recordingId,
  });
  return { status: "archived", recordingId, folderId };
}

export default defineComponent({
  name: "Poll Claap recordings into Google Drive",
  description: "Polling + Node.js. Upserts raw transcript + metadata. No AI notes.",
  props: {
    googleDrive: { type: "app", app: "google_drive" },
    claapApiKey: { type: "string", label: "Claap API key", secret: true },
    rootFolderId: { type: "string", label: "Google Drive root folder ID" },
    lookbackHours: { type: "integer", label: "Lookback hours", default: 48 },
    recordingId: {
      type: "string",
      label: "Force-archive one recording ID",
      optional: true,
    },
  },
  async run({ $ }) {
    const token = this.googleDrive.$auth.oauth_access_token;
    if (this.recordingId) {
      const result = await archiveOne(this.claapApiKey, token, this.rootFolderId, this.recordingId);
      $.export("summary", `${result.status} ${this.recordingId}`);
      return result;
    }
    const createdAfter = new Date(Date.now() - this.lookbackHours * 3600 * 1000).toISOString();
    const results = [];
    let cursor;
    do {
      const query = new URLSearchParams({ createdAfter, limit: "50", sort: "created_asc" });
      if (cursor) {
        query.set("cursor", cursor);
      }
      const page = await claapGet(this.claapApiKey, `v1/recordings?${query}`);
      for (const recording of page.result.recordings) {
        results.push(await archiveOne(this.claapApiKey, token, this.rootFolderId, recording.id));
      }
      cursor = page.result.pagination?.nextCursor;
    } while (cursor);
    const archived = results.filter((result) => result.status === "archived").length;
    $.export("summary", `Archived ${archived}/${results.length} since ${createdAfter}`);
    return { createdAfter, archived, results };
  },
});
