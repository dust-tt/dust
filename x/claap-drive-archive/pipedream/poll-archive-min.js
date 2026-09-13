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
      const hit = listed.find(
        (r) => r.id === recordingId || (r.url && r.url.includes(recordingId))
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
    const q = encodeURIComponent(`name='${email}' and '${this.rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const found = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&includeItemsFromAllDrives=true&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then((r) => r.json());
    let folderId = found.files?.[0]?.id;
    if (!folderId) {
      const created = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: email,
          mimeType: "application/vnd.google-apps.folder",
          parents: [this.rootFolderId],
        }),
      }).then((r) => r.json());
      folderId = created.id;
    }
    const base = `${date}_${rec.id}`;
    const boundary = "xxx";
    async function put(name, mime, content) {
      const body =
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
        `${JSON.stringify({ name, mimeType: mime, parents: [folderId] })}\r\n` +
        `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n${content}\r\n--${boundary}--`;
      return fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        }
      ).then((r) => r.json());
    }
    const mdFile = await put(`${base}.md`, "text/markdown", md);
    const jsonFile = await put(`${base}.json`, "application/json", json);
    $.export("summary", `Archived ${recordingId} to ${folderId}`);
    return { recordingId, requestedId: this.recordingId, listed, folderId, mdFile, jsonFile };
  },
});
