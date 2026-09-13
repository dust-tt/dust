export default defineComponent({
  name: "Archive one Claap recording to Drive",
  props: {
    googleDrive: { type: "app", app: "google_drive" },
    claapApiKey: { type: "string", label: "Claap API key", secret: true },
    rootFolderId: { type: "string", label: "Google Drive root folder ID" },
    recordingId: { type: "string", label: "Claap recording ID or URL slug" },
  },
  async run({ $ }) {
    const headers = { Accept: "application/json", "X-Claap-Key": this.claapApiKey };
    const token = this.googleDrive.$auth.oauth_access_token;

    async function claap(path) {
      const res = await fetch(`https://api.claap.io/${path}`, { headers });
      const text = await res.text();
      if (!res.ok) throw new Error(`Claap ${res.status} ${path}: ${text}`);
      return JSON.parse(text);
    }

    let recordingId = this.recordingId;
    let listed = [];
    try {
      await claap(`v1/recordings/${encodeURIComponent(recordingId)}`);
    } catch (error) {
      if (!String(error.message).includes(" 404 ")) throw error;
      const page = await claap("v1/recordings?limit=50&sort=created_desc");
      listed = (page.result.recordings || []).map((r) => ({
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
      recordingId = hit.id;
    }

    const rec = (await claap(`v1/recordings/${encodeURIComponent(recordingId)}`)).result.recording;
    let tr = null;
    try {
      tr = (await claap(`v1/recordings/${encodeURIComponent(recordingId)}/transcript?format=json`))
        .result.transcript;
    } catch (error) {
      console.warn("Transcript missing", error);
    }
    const segs = (tr?.segments || [])
      .map((s) => `${(s.speaker || "unknown").trim()}: ${String(s.text || "").trim()}`)
      .join("\n") || "_No transcript was available for this recording._";
    const email = (rec.recorder?.email || "unknown").toLowerCase();
    const date = String(rec.createdAt || "").slice(0, 10);
    const md =
      `---\nclaap_id: ${rec.id}\ntitle: ${JSON.stringify(rec.title || "")}\n` +
      `recorder_email: ${email}\nclaap_url: ${rec.url}\n---\n\n# Transcript\n\n${segs}\n`;
    const json = JSON.stringify({ archivedAt: new Date().toISOString(), recording: rec, transcript: tr }, null, 2);

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
        const named = await drive(
          "https://www.googleapis.com/drive/v3/files?" +
            `q=${encodeURIComponent("name='Claap Recordings' and mimeType='application/vnd.google-apps.folder' and trashed=false")}` +
            "&corpora=allDrives&includeItemsFromAllDrives=true&supportsAllDrives=true" +
            `&fields=files(${fields})&pageSize=10`
        );
        const hit =
          (named.files || []).find((f) => f.id === id) ||
          (named.files || []).find((f) => f.driveId) ||
          named.files?.[0];
        if (hit?.id) return hit;
        let drives = {};
        try {
          drives = await drive("https://www.googleapis.com/drive/v3/drives?pageSize=20");
        } catch (driveErr) {
          drives = { error: String(driveErr.message).slice(0, 300) };
        }
        throw new Error(
          `${getErr.message} | namedFolders=${JSON.stringify(named.files || [])} | drives=${JSON.stringify(drives).slice(0, 400)}`
        );
      }
    }
    const root = await resolveRoot();
    const driveQs = root.driveId
      ? `corpora=drive&driveId=${encodeURIComponent(root.driveId)}&includeItemsFromAllDrives=true&supportsAllDrives=true`
      : "corpora=allDrives&includeItemsFromAllDrives=true&supportsAllDrives=true";

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

    let folder = await findInFolder(root.id, email, "application/vnd.google-apps.folder");
    if (!folder?.id) {
      folder = await drive(
        "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: email,
            mimeType: "application/vnd.google-apps.folder",
            parents: [root.id],
          }),
        }
      );
    }
    const folderId = folder.id;
    if (!folderId) throw new Error(`Drive folder create returned no id: ${JSON.stringify(folder)}`);

    const base = `${date}_${rec.id}`;
    const boundary = "xxx";
    async function put(name, mime, content) {
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
      return drive(url, {
        method: existing?.id ? "PATCH" : "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      });
    }

    const mdFile = await put(`${base}.md`, "text/markdown", md);
    const jsonFile = await put(`${base}.json`, "application/json", json);
    if (!mdFile.id || !jsonFile.id) {
      throw new Error(`Drive upload missing id md=${JSON.stringify(mdFile)} json=${JSON.stringify(jsonFile)}`);
    }
    $.export("summary", `Archived ${recordingId} to ${folderId}`);
    return {
      recordingId,
      requestedId: this.recordingId,
      listed,
      driveId: root.driveId || null,
      rootName: root.name,
      folderId,
      mdFile,
      jsonFile,
    };
  },
});
