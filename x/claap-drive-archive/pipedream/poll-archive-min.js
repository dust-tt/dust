export default defineComponent({
  name: "Poll Claap recordings into Google Drive",
  description:
    "Hourly poll of GET /v1/recordings. Optional recordingId forces one. Upsert by filename on Shared Drive.",
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
    const headers = { Accept: "application/json", "X-Claap-Key": this.claapApiKey };
    const token = this.googleDrive.$auth.oauth_access_token;
    const SHARED_DRIVE_ID = "0AHg4obkq7gi_Uk9PVA";
    const FOLDER = "application/vnd.google-apps.folder";
    const forceId = String(this.recordingId || "").trim();
    const lookbackHours = Number(this.lookbackHours) > 0 ? Number(this.lookbackHours) : 48;
    const maxPerRun = Number(this.maxPerRun) > 0 ? Number(this.maxPerRun) : 8;

    async function claap(path) {
      const res = await fetch(`https://api.claap.io/${path}`, { headers });
      const text = await res.text();
      if (!res.ok) throw new Error(`Claap ${res.status} ${path}: ${text}`);
      return JSON.parse(text);
    }

    async function drive(url, init = {}) {
      const res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
      });
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text.slice(0, 400) };
      }
      if (!res.ok || data.error) {
        throw new Error(`Drive ${res.status} ${url.split("?")[0]}: ${JSON.stringify(data).slice(0, 500)}`);
      }
      return data;
    }

    const requestedRootId = this.rootFolderId;
    async function resolveRoot() {
      const id = requestedRootId;
      const fields = "id,name,driveId,parents";
      try {
        return await drive(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${fields}&supportsAllDrives=true`
        );
      } catch (getErr) {
        const q = encodeURIComponent(
          "name='Claap Recordings' and mimeType='application/vnd.google-apps.folder' and trashed=false"
        );
        const namedOnDrive = await drive(
          "https://www.googleapis.com/drive/v3/files?" +
            `q=${q}&corpora=drive&driveId=${encodeURIComponent(SHARED_DRIVE_ID)}` +
            "&includeItemsFromAllDrives=true&supportsAllDrives=true" +
            `&fields=files(${fields})&pageSize=10`
        );
        const namedAll = await drive(
          "https://www.googleapis.com/drive/v3/files?" +
            `q=${q}&corpora=allDrives&includeItemsFromAllDrives=true&supportsAllDrives=true` +
            `&fields=files(${fields})&pageSize=10`
        );
        const namedFiles = [...(namedOnDrive.files || []), ...(namedAll.files || [])];
        const hit =
          namedFiles.find((f) => f.id === id) ||
          namedFiles.find((f) => f.driveId === SHARED_DRIVE_ID) ||
          namedFiles.find((f) => f.driveId) ||
          namedFiles[0];
        if (hit?.id) return hit;
        let drives = {};
        try {
          drives = await drive("https://www.googleapis.com/drive/v3/drives?pageSize=20");
        } catch (driveErr) {
          drives = { error: String(driveErr.message).slice(0, 300) };
        }
        throw new Error(
          `${getErr.message} | namedFolders=${JSON.stringify(namedFiles)} | drives=${JSON.stringify(drives).slice(0, 400)}`
        );
      }
    }
    const root = await resolveRoot();
    const driveQs = root.driveId
      ? `corpora=drive&driveId=${encodeURIComponent(root.driveId)}&includeItemsFromAllDrives=true&supportsAllDrives=true`
      : "corpora=allDrives&includeItemsFromAllDrives=true&supportsAllDrives=true";

    async function listChildren(parentId) {
      const files = [];
      let pageToken;
      do {
        const q = encodeURIComponent(`'${parentId}' in parents and trashed=false`);
        const tokenQs = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
        const data = await drive(
          `https://www.googleapis.com/drive/v3/files?q=${q}&${driveQs}` +
            `&fields=nextPageToken,files(id,name,mimeType,webViewLink)&pageSize=100${tokenQs}`
        );
        files.push(...(data.files || []));
        pageToken = data.nextPageToken;
      } while (pageToken);
      return files;
    }

    async function findInFolder(parentId, name, mime) {
      const safe = String(name).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const q = encodeURIComponent(
        `name='${safe}' and '${parentId}' in parents and trashed=false` +
          (mime ? ` and mimeType='${mime}'` : "")
      );
      const found = await drive(
        `https://www.googleapis.com/drive/v3/files?q=${q}&${driveQs}&fields=files(id,name,webViewLink)&pageSize=1`
      );
      return found.files?.[0] || null;
    }

    const folderByEmail = new Map();
    const namesByFolderId = new Map();
    for (const child of await listChildren(root.id)) {
      if (child.mimeType === FOLDER) folderByEmail.set(String(child.name).toLowerCase(), child);
    }

    async function fileNames(folderId) {
      if (!namesByFolderId.has(folderId)) {
        namesByFolderId.set(folderId, new Set((await listChildren(folderId)).map((f) => f.name)));
      }
      return namesByFolderId.get(folderId);
    }

    function archiveNames(recording) {
      const date = String(recording.createdAt || "").slice(0, 10);
      return { email: (recording.recorder?.email || "unknown").toLowerCase(), base: `${date}_${recording.id}` };
    }

    async function alreadyArchived(recording) {
      const { email, base } = archiveNames(recording);
      const folder = folderByEmail.get(email);
      if (!folder?.id) return false;
      const names = await fileNames(folder.id);
      return names.has(`${base}.md`) && names.has(`${base}.json`);
    }

    async function ensureEmailFolder(email) {
      let folder = folderByEmail.get(email);
      if (!folder?.id) {
        folder = await findInFolder(root.id, email, FOLDER);
        if (!folder?.id) {
          folder = await drive(
            "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: email, mimeType: FOLDER, parents: [root.id] }),
            }
          );
        }
        folderByEmail.set(email, folder);
      }
      if (!folder.id) throw new Error(`Drive folder create returned no id: ${JSON.stringify(folder)}`);
      return folder;
    }

    const boundary = "xxx";
    async function put(folderId, name, mime, content) {
      const existing = await findInFolder(folderId, name);
      const meta = existing?.id
        ? { name, mimeType: mime }
        : { name, mimeType: mime, parents: [folderId] };
      const body =
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
        `${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n${content}\r\n--${boundary}--`;
      const url = existing?.id
        ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`
        : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink";
      const file = await drive(url, {
        method: existing?.id ? "PATCH" : "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
      if (!file.id) throw new Error(`Drive upload missing id ${name}: ${JSON.stringify(file)}`);
      const cached = namesByFolderId.get(folderId);
      if (cached) cached.add(name);
      return file;
    }

    async function resolveRecordingId(recordingId) {
      try {
        await claap(`v1/recordings/${encodeURIComponent(recordingId)}`);
        return { recordingId, listed: [] };
      } catch (error) {
        if (!String(error.message).includes(" 404 ")) throw error;
        const page = await claap("v1/recordings?limit=50&sort=created_desc");
        const listed = (page.result.recordings || []).map((r) => ({
          id: r.id,
          title: r.title,
          url: r.url,
          state: r.state,
        }));
        const suffix = recordingId.includes("-") ? recordingId.split("-").pop() : recordingId;
        const hit = listed.find(
          (r) =>
            r.id === recordingId ||
            r.id === suffix ||
            recordingId.endsWith(r.id) ||
            (r.url && (r.url.includes(recordingId) || r.url.endsWith(r.id)))
        );
        if (!hit) {
          throw new Error(
            `Claap recording 404 for ${recordingId}. Listed ${listed.length}: ${JSON.stringify(listed)}`
          );
        }
        return { recordingId: hit.id, listed };
      }
    }

    async function archiveOne(recordingId) {
      const rec = (await claap(`v1/recordings/${encodeURIComponent(recordingId)}`)).result.recording;
      if (rec.state !== "Ready") {
        return { status: "skipped", recordingId, reason: rec.state, title: rec.title };
      }
      let tr = null;
      try {
        tr = (await claap(`v1/recordings/${encodeURIComponent(recordingId)}/transcript?format=json`))
          .result.transcript;
      } catch (error) {
        console.warn("Transcript missing", error);
      }
      const email = (rec.recorder?.email || "unknown").toLowerCase();
      const date = String(rec.createdAt || "").slice(0, 10);
      const md =
        `---\nclaap_id: ${rec.id}\ntitle: ${JSON.stringify(rec.title || "")}\n` +
        `recorder_email: ${email}\nclaap_url: ${rec.url}\n---\n\n# Transcript\n\n` +
        ((tr?.segments || [])
          .map((s) => `${(s.speaker || "unknown").trim()}: ${String(s.text || "").trim()}`)
          .join("\n") || "_No transcript was available for this recording._") +
        "\n";
      const json = JSON.stringify(
        { archivedAt: new Date().toISOString(), recording: rec, transcript: tr },
        null,
        2
      );
      const folder = await ensureEmailFolder(email);
      const base = `${date}_${rec.id}`;
      const mdFile = await put(folder.id, `${base}.md`, "text/markdown", md);
      const jsonFile = await put(folder.id, `${base}.json`, "application/json", json);
      return {
        status: "archived",
        recordingId: rec.id,
        title: rec.title || "",
        recorderEmail: email,
        createdAt: rec.createdAt,
        folderId: folder.id,
        folderLink: folder.webViewLink || null,
        mdFile,
        jsonFile,
      };
    }

    if (forceId) {
      const resolved = await resolveRecordingId(forceId);
      const result = await archiveOne(resolved.recordingId);
      $.export("summary", `${result.status} ${resolved.recordingId}`);
      return {
        mode: "single",
        requestedId: forceId,
        listed: resolved.listed,
        driveId: root.driveId || null,
        rootName: root.name,
        rootId: root.id,
        ...result,
      };
    }

    const createdAfter = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
    const listed = [];
    let cursor;
    let totalCount = 0;
    let pages = 0;
    do {
      const query = new URLSearchParams({ createdAfter, limit: "50", sort: "created_asc" });
      if (cursor) query.set("cursor", cursor);
      const page = await claap(`v1/recordings?${query}`);
      listed.push(...(page.result?.recordings || []));
      totalCount = page.result?.pagination?.totalCount ?? totalCount;
      pages += 1;
      cursor = page.result?.pagination?.nextCursor;
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
      if (await alreadyArchived(recording)) {
        results.push({ ...item, status: "skipped", reason: "already_archived" });
        continue;
      }
      if (archivedThisRun >= maxPerRun) {
        results.push({ ...item, status: "deferred", reason: "maxPerRun" });
        continue;
      }
      results.push(await archiveOne(recording.id));
      archivedThisRun += 1;
    }

    const archived = results.filter((r) => r.status === "archived").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const deferred = results.filter((r) => r.status === "deferred").length;
    $.export(
      "summary",
      `Archived ${archived}/${results.length} (skipped ${skipped}, deferred ${deferred}) since ${createdAfter} pages=${pages} listedTotal=${totalCount}`
    );
    return {
      mode: "poll",
      createdAfter,
      lookbackHours,
      maxPerRun,
      driveId: root.driveId || null,
      rootName: root.name,
      rootId: root.id,
      pages,
      listedTotal: totalCount || listed.length,
      archived,
      skipped,
      deferred,
      results,
    };
  },
});
