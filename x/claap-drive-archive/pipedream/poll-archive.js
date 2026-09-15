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

async function findFile(token, query, driveId) {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "files(id,name,webViewLink,driveId)");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("supportsAllDrives", "true");
  if (driveId) {
    url.searchParams.set("corpora", "drive");
    url.searchParams.set("driveId", driveId);
  } else {
    url.searchParams.set("corpora", "allDrives");
  }
  return (await driveJson(token, url)).files?.[0] ?? null;
}

async function resolveRoot(token, requestedRootId) {
  const fields = "id,name,driveId,parents";
  const sharedDriveId = "0AHg4obkq7gi_Uk9PVA";
  try {
    return await driveJson(
      token,
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(requestedRootId)}?fields=${fields}&supportsAllDrives=true`
    );
  } catch (getErr) {
    const q = "name='Claap Recordings' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    const named = await findFile(token, q, sharedDriveId);
    if (named?.id) {
      return named;
    }
    throw new Error(`${getErr.message} | namedFolder=${JSON.stringify(named)}`);
  }
}

async function ensureFolder(token, parentId, name, driveId) {
  const existing = await findFile(
    token,
    `mimeType='${FOLDER}' and name='${esc(name)}' and '${esc(parentId)}' in parents and trashed=false`,
    driveId
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

async function upsertFile(token, { parentId, name, mimeType, content, driveId }) {
  const existing = await findFile(
    token,
    `name='${esc(name)}' and '${esc(parentId)}' in parents and trashed=false`,
    driveId
  );
  const boundary = "claaparchive";
  const metadata = existing ? { name, mimeType } : { name, mimeType, parents: [parentId] };
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

async function archiveOne(apiKey, token, root, recordingId) {
  recordingId = await resolveRecordingId(apiKey, recordingId);
  const recording = (await claapGet(apiKey, `v1/recordings/${encodeURIComponent(recordingId)}`)).result
    .recording;
  if (recording.state !== "Ready") {
    return { status: "skipped", recordingId, reason: recording.state, title: recording.title };
  }
  let transcript = null;
  try {
    transcript = (
      await claapGet(apiKey, `v1/recordings/${encodeURIComponent(recordingId)}/transcript?format=json`)
    ).result.transcript;
  } catch (error) {
    console.warn("Transcript missing", error);
  }
  const email = slug((recording.recorder?.email || "_unknown").toLowerCase());
  const folderId = await ensureFolder(token, root.id, email, root.driveId);
  const base = `${String(recording.createdAt || "").slice(0, 10)}_${recording.id}`;
  await upsertFile(token, {
    parentId: folderId,
    name: `${base}.md`,
    mimeType: "text/markdown",
    content: markdown(recording, transcript),
    driveId: root.driveId,
  });
  await upsertFile(token, {
    parentId: folderId,
    name: `${base}.json`,
    mimeType: "application/json",
    content: `${JSON.stringify({ archivedAt: new Date().toISOString(), recording, transcript }, null, 2)}\n`,
    driveId: root.driveId,
  });
  return {
    status: "archived",
    recordingId,
    title: recording.title || "",
    recorderEmail: email,
    folderId,
  };
}

export default defineComponent({
  name: "Poll Claap recordings into Google Drive",
  description: "Polling + Node.js. Upserts raw transcript + metadata. No AI notes.",
  props: {
    googleDrive: { type: "app", app: "google_drive" },
    claapApiKey: { type: "string", label: "Claap API key", secret: true },
    rootFolderId: { type: "string", label: "Google Drive root folder ID" },
    lookbackHours: { type: "integer", label: "Lookback hours", default: 48 },
    maxPerRun: {
      type: "integer",
      label: "Max new archives per run",
      default: 8,
      optional: true,
    },
    recordingId: {
      type: "string",
      label: "Force-archive one recording ID",
      optional: true,
    },
  },
  async run({ $ }) {
    const token = this.googleDrive.$auth.oauth_access_token;
    const root = await resolveRoot(token, this.rootFolderId);
    const forceId = String(this.recordingId || "").trim();
    const lookbackHours = Number(this.lookbackHours) > 0 ? Number(this.lookbackHours) : 48;
    const maxPerRun = Number(this.maxPerRun) > 0 ? Number(this.maxPerRun) : 8;
    if (forceId) {
      const result = await archiveOne(this.claapApiKey, token, root, forceId);
      $.export("summary", `${result.status} ${forceId}`);
      return { mode: "single", rootId: root.id, rootName: root.name, ...result };
    }
    const createdAfter = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
    const listed = [];
    let cursor;
    let pages = 0;
    do {
      const query = new URLSearchParams({ createdAfter, limit: "50", sort: "created_asc" });
      if (cursor) {
        query.set("cursor", cursor);
      }
      const page = await claapGet(this.claapApiKey, `v1/recordings?${query}`);
      listed.push(...(page.result.recordings || []));
      pages += 1;
      cursor = page.result.pagination?.nextCursor;
    } while (cursor && pages < 20);

    const results = [];
    let archivedThisRun = 0;
    for (const recording of listed) {
      const item = {
        recordingId: recording.id,
        title: recording.title || "",
        recorderEmail: (recording.recorder?.email || "unknown").toLowerCase(),
        createdAt: recording.createdAt,
        state: recording.state,
      };
      if (recording.state !== "Ready") {
        results.push({ ...item, status: "skipped", reason: recording.state });
        continue;
      }
      if (archivedThisRun >= maxPerRun) {
        results.push({ ...item, status: "deferred", reason: "maxPerRun" });
        continue;
      }
      results.push(await archiveOne(this.claapApiKey, token, root, recording.id));
      if (results.at(-1)?.status === "archived") {
        archivedThisRun += 1;
      }
    }
    const archived = results.filter((result) => result.status === "archived").length;
    const skipped = results.filter((result) => result.status === "skipped").length;
    const deferred = results.filter((result) => result.status === "deferred").length;
    $.export(
      "summary",
      `Archived ${archived}/${results.length} (skipped ${skipped}, deferred ${deferred}) since ${createdAfter}`
    );
    return { mode: "poll", createdAfter, lookbackHours, maxPerRun, archived, skipped, deferred, results };
  },
});
