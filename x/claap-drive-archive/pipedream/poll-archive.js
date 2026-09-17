export default defineComponent({
  name: "Poll Claap recordings into Google Drive",
  description:
    "Hourly poll of GET /v1/recordings. External calls only. Flat files in Claap Recordings. Optional recordingId forces one.",
  props: {
    googleDrive: { type: "app", app: "google_drive" },
    claapApiKey: { type: "string", label: "Claap API key", secret: true },
    rootFolderId: { type: "string", label: "Google Drive root folder ID" },
    lookbackHours: {
      type: "integer",
      label: "Lookback hours (336 = 14 days)",
      default: 336,
    },
    maxPerRun: {
      type: "integer",
      label: "Max new archives per run",
      default: 40,
      optional: true,
    },
    recordingId: {
      type: "string",
      label: "Force-archive one recording ID (leave empty for the schedule)",
      optional: true,
    },
  },
  async run({ $ }) {
    const headers = { Accept: "application/json", "X-Claap-Key": this.claapApiKey };
    const token = this.googleDrive.$auth.oauth_access_token;
    const SHARED_DRIVE_ID = "0AHg4obkq7gi_Uk9PVA";
    const FOLDER = "application/vnd.google-apps.folder";
    const DUST_DOMAIN = "dust.tt";
    const forceId = String(this.recordingId || "").trim();
    const lookbackHours = Number(this.lookbackHours) > 0 ? Number(this.lookbackHours) : 336;
    const maxPerRun = Number(this.maxPerRun) > 0 ? Number(this.maxPerRun) : 40;

    function isDustEmail(email) {
      const domain = String(email || "")
        .toLowerCase()
        .trim()
        .split("@")[1];
      return domain === DUST_DOMAIN || Boolean(domain && domain.endsWith(`.${DUST_DOMAIN}`));
    }

    function classifyExternal(recording) {
      const meetingType = recording.meeting?.type ?? null;
      if (meetingType === "external") {
        return { external: true, reason: "meeting.type=external", meetingType };
      }
      if (meetingType === "internal") {
        return { external: false, reason: "meeting.type=internal", meetingType };
      }
      const emails = [
        ...(recording.meeting?.participants || []).map((person) => person.email),
        recording.recorder?.email,
      ].filter(Boolean);
      const outside = emails.filter((email) => !isDustEmail(email));
      if (outside.length) {
        return {
          external: true,
          reason: `meeting.type missing; non-dust.tt emails ${outside.join(",")}`,
          meetingType,
        };
      }
      if (emails.length) {
        return {
          external: false,
          reason: "meeting.type missing; all participant emails are @dust.tt",
          meetingType,
        };
      }
      const channel = String(recording.channel?.name || "").trim().toLowerCase();
      if (channel === "external") {
        return { external: true, reason: "meeting.type missing; channel=External", meetingType };
      }
      if (channel === "internal") {
        return { external: false, reason: "meeting.type missing; channel=Internal", meetingType };
      }
      return {
        external: false,
        reason: "meeting.type missing; no participant emails or channel signal",
        meetingType,
      };
    }

    function isPersonFolder(name) {
      const n = String(name || "").trim().toLowerCase();
      return n.includes("@") || n === "_unknown";
    }

    function sanitize(value) {
      const cleaned = String(value || "untitled")
        .normalize("NFKD")
        .replace(/[\u0000-\u001f]/g, "")
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      return cleaned || "untitled";
    }

    function yamlScalar(value) {
      if (value === null || value === undefined) return "null";
      if (typeof value === "boolean" || typeof value === "number") return String(value);
      const text = String(value);
      if (
        text === "" ||
        text === "true" ||
        text === "false" ||
        text === "null" ||
        /[:#\n\r"'{}[\]&*?|<>=!%`,]/.test(text) ||
        /\s/.test(text) ||
        /^-/.test(text)
      ) {
        return JSON.stringify(text);
      }
      return text;
    }

    function ts(seconds) {
      const total = Math.max(0, Math.floor(Number(seconds) || 0));
      return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
        .map((part) => String(part).padStart(2, "0"))
        .join(":");
    }

    function personLines(person, indent = "  ") {
      const lines = [`${indent}- name: ${yamlScalar(person?.name ?? "")}`];
      if (person?.email) lines.push(`${indent}  email: ${yamlScalar(person.email)}`);
      lines.push(`${indent}  attended: ${yamlScalar(Boolean(person?.attended))}`);
      return lines;
    }

    function archiveBase(recording) {
      const date = String(recording.createdAt || "").slice(0, 10);
      const title = sanitize(recording.title || "untitled").slice(0, 80);
      return `${date}_${title}_${recording.id}`;
    }

    function recordingIdFromName(name) {
      const stem = String(name || "").replace(/\.(md|json)$/i, "");
      if (!stem) return "";
      return stem.includes("_") ? stem.split("_").pop() : stem;
    }

    function matchesRecording(name, recordingId) {
      const stem = String(name || "").replace(/\.(md|json)$/i, "");
      return stem === recordingId || stem.endsWith(`_${recordingId}`);
    }

    function markdown(recording, transcript) {
      const participants = recording.meeting?.participants ?? [];
      const companies = recording.companies ?? [];
      const labels = recording.labels ?? [];
      const date = String(recording.createdAt || "").slice(0, 10);
      const frontmatter = [
        `claap_id: ${yamlScalar(recording.id)}`,
        `title: ${yamlScalar(recording.title ?? "")}`,
        `created_at: ${yamlScalar(recording.createdAt ?? null)}`,
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
        `claap_url: ${yamlScalar(recording.url ?? null)}`,
        `transcript_only: ${yamlScalar(Boolean(recording.transcriptOnly))}`,
        `video_available: false`,
      ];
      const body = transcript?.segments?.length
        ? transcript.segments
            .map((segment) => {
              const speaker = (segment.speaker || "unknown").trim();
              return `[${ts(segment.startedAt)}] ${speaker}: ${String(segment.text || "").trim()}`;
            })
            .join("\n")
        : "_No transcript was available for this recording._";
      return `---\n${frontmatter.join("\n")}\n---\n\n# Transcript\n\n${body}\n`;
    }

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
            `&fields=nextPageToken,files(id,name,mimeType,webViewLink,parents)&pageSize=100${tokenQs}`
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
        `https://www.googleapis.com/drive/v3/files?q=${q}&${driveQs}&fields=files(id,name,webViewLink)&pageSize=10`
      );
      return found.files?.[0] || null;
    }

    async function trash(fileId) {
      await drive(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,trashed`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }
      );
    }

    async function moveToRoot(fileId, fromParentId) {
      await drive(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(root.id)}` +
          `&removeParents=${encodeURIComponent(fromParentId)}&supportsAllDrives=true&fields=id,name,parents`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
    }

    async function rename(fileId, name) {
      return drive(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,webViewLink`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }
      );
    }

    const boundary = "xxx";
    async function put(name, mime, content) {
      let existing = rootNonFolders().find((f) => f.name === name) || null;
      if (!existing) existing = await findInFolder(root.id, name);
      const meta = existing?.id ? { name, mimeType: mime } : { name, mimeType: mime, parents: [root.id] };
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
      upsertCache(file);
      return file;
    }

    function filesForId(files, recordingId) {
      const md = files.filter((f) => matchesRecording(f.name, recordingId) && /\.md$/i.test(f.name));
      const json = files.filter((f) => matchesRecording(f.name, recordingId) && /\.json$/i.test(f.name));
      return { md, json };
    }

    let rootFiles = [];
    async function refreshRoot() {
      rootFiles = await listChildren(root.id);
      return rootFiles;
    }
    function rootNonFolders() {
      return rootFiles.filter((f) => f.mimeType !== FOLDER);
    }
    function upsertCache(file) {
      if (!file?.id) return;
      rootFiles = rootFiles.filter((f) => f.id !== file.id && f.name !== file.name);
      rootFiles.push(file);
    }
    function dropCache(fileId) {
      rootFiles = rootFiles.filter((f) => f.id !== fileId);
    }

    async function flattenPersonFolders() {
      const moved = [];
      const trashedDuplicates = [];
      const trashedFolders = [];
      const leftoverFolders = [];
      const children = await listChildren(root.id);
      const rootNames = new Set(children.filter((c) => c.mimeType !== FOLDER).map((c) => c.name));
      const personFolders = children.filter((c) => c.mimeType === FOLDER && isPersonFolder(c.name));
      for (const folder of personFolders) {
        const nested = await listChildren(folder.id);
        for (const file of nested) {
          if (file.mimeType === FOLDER) {
            leftoverFolders.push({ parent: folder.name, name: file.name, id: file.id });
            continue;
          }
          if (rootNames.has(file.name)) {
            await trash(file.id);
            trashedDuplicates.push({ name: file.name, from: folder.name });
          } else {
            await moveToRoot(file.id, folder.id);
            rootNames.add(file.name);
            moved.push({ name: file.name, from: folder.name });
          }
        }
        const remaining = await listChildren(folder.id);
        if (remaining.length === 0) {
          await trash(folder.id);
          trashedFolders.push(folder.name);
        } else {
          leftoverFolders.push({
            parent: folder.name,
            remaining: remaining.map((f) => f.name),
          });
        }
      }
      return { moved, trashedDuplicates, trashedFolders, leftoverFolders };
    }

    async function trashRecordingFiles(recordingId) {
      const { md, json } = filesForId(rootNonFolders(), recordingId);
      const trashed = [];
      for (const file of [...md, ...json]) {
        await trash(file.id);
        dropCache(file.id);
        trashed.push(file.name);
      }
      return trashed;
    }

    function alreadyArchived(recording) {
      const { md, json } = filesForId(rootNonFolders(), recording.id);
      return md.length > 0 && json.length > 0;
    }

    async function renameToCanonical(recording) {
      const canonical = archiveBase(recording);
      const { md, json } = filesForId(rootNonFolders(), recording.id);
      const renamed = [];
      if (md[0] && md[0].name !== `${canonical}.md`) {
        const updated = await rename(md[0].id, `${canonical}.md`);
        dropCache(md[0].id);
        upsertCache({ ...md[0], ...updated, name: `${canonical}.md` });
        renamed.push(`${md[0].name} -> ${canonical}.md`);
        for (const extra of md.slice(1)) {
          await trash(extra.id);
          dropCache(extra.id);
          renamed.push(`trashed extra ${extra.name}`);
        }
      }
      if (json[0] && json[0].name !== `${canonical}.json`) {
        const updated = await rename(json[0].id, `${canonical}.json`);
        dropCache(json[0].id);
        upsertCache({ ...json[0], ...updated, name: `${canonical}.json` });
        renamed.push(`${json[0].name} -> ${canonical}.json`);
        for (const extra of json.slice(1)) {
          await trash(extra.id);
          dropCache(extra.id);
          renamed.push(`trashed extra ${extra.name}`);
        }
      }
      return renamed;
    }

    async function resolveRecordingId(recordingId) {
      try {
        await claap(`v1/recordings/${encodeURIComponent(recordingId)}`);
        return { recordingId, listed: [] };
      } catch (error) {
        if (!String(error.message).includes(" 404 ")) throw error;
        const page = await claap("v1/recordings?limit=100&sort=created_desc");
        const listed = (page.result.recordings || []).map((r) => ({
          id: r.id,
          title: r.title,
          url: r.url,
          state: r.state,
          meetingType: r.meeting?.type ?? null,
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
      const visibility = classifyExternal(rec);
      if (!visibility.external) {
        const trashed = await trashRecordingFiles(rec.id);
        console.log("skip internal", rec.id, rec.title, visibility.reason, "trashed", trashed);
        return {
          status: "skipped",
          recordingId: rec.id,
          title: rec.title || "",
          reason: visibility.reason,
          meetingType: visibility.meetingType,
          trashed,
        };
      }
      let tr = null;
      try {
        tr = (await claap(`v1/recordings/${encodeURIComponent(recordingId)}/transcript?format=json`))
          .result.transcript;
      } catch (error) {
        console.warn("Transcript missing", recordingId, error);
      }
      const base = archiveBase(rec);
      const existing = filesForId(rootNonFolders(), rec.id);
      if (existing.md[0] && existing.md[0].name !== `${base}.md`) {
        const updated = await rename(existing.md[0].id, `${base}.md`);
        dropCache(existing.md[0].id);
        upsertCache({ ...existing.md[0], ...updated, name: `${base}.md` });
      }
      if (existing.json[0] && existing.json[0].name !== `${base}.json`) {
        const updated = await rename(existing.json[0].id, `${base}.json`);
        dropCache(existing.json[0].id);
        upsertCache({ ...existing.json[0], ...updated, name: `${base}.json` });
      }
      const mdFile = await put(`${base}.md`, "text/markdown", markdown(rec, tr));
      const jsonFile = await put(
        `${base}.json`,
        "application/json",
        JSON.stringify({ archivedAt: new Date().toISOString(), recording: rec, transcript: tr }, null, 2)
      );
      return {
        status: "archived",
        recordingId: rec.id,
        title: rec.title || "",
        recorderEmail: (rec.recorder?.email || "unknown").toLowerCase(),
        createdAt: rec.createdAt,
        meetingType: rec.meeting?.type ?? null,
        channel: rec.channel?.name ?? null,
        folderId: root.id,
        folderLink: root.webViewLink || null,
        mdFile,
        jsonFile,
      };
    }

    const flatten = await flattenPersonFolders();
    await refreshRoot();

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
        flatten,
        notes: {
          privateRecordings:
            "Claap API omits recordings that are not visible in global search / member-accessible channels.",
          dustDomain: DUST_DOMAIN,
          meetingTypeField: "recording.meeting.type is internal|external",
        },
        ...result,
      };
    }

    const createdAfter = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
    const listed = [];
    let cursor;
    let totalCount = 0;
    let pages = 0;
    do {
      const query = new URLSearchParams({ createdAfter, limit: "100", sort: "created_asc" });
      if (cursor) query.set("cursor", cursor);
      const page = await claap(`v1/recordings?${query}`);
      listed.push(...(page.result?.recordings || []));
      totalCount = page.result?.pagination?.totalCount ?? totalCount;
      pages += 1;
      cursor = page.result?.pagination?.nextCursor;
    } while (cursor && pages < 50);

    const results = [];
    let archivedThisRun = 0;
    for (const recording of listed) {
      const visibility = classifyExternal(recording);
      const item = {
        recordingId: recording.id,
        title: recording.title || "",
        recorderEmail: (recording.recorder?.email || "unknown").toLowerCase(),
        createdAt: recording.createdAt,
        state: recording.state,
        meetingType: visibility.meetingType,
        channel: recording.channel?.name ?? null,
      };
      if (recording.state !== "Ready") {
        results.push({ ...item, status: "skipped", reason: recording.state });
        continue;
      }
      if (!visibility.external) {
        const trashed = await trashRecordingFiles(recording.id);
        console.log("skip", recording.id, recording.title, visibility.reason);
        results.push({ ...item, status: "skipped", reason: visibility.reason, trashed });
        continue;
      }
      if (alreadyArchived(recording)) {
        const renamed = await renameToCanonical(recording);
        results.push({ ...item, status: "skipped", reason: "already_archived", renamed });
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
    const skippedInternal = results.filter((r) => String(r.reason || "").includes("internal")).length;
    $.export(
      "summary",
      `Archived ${archived}/${results.length} external (skipped ${skipped}, internal ${skippedInternal}, deferred ${deferred}) since ${createdAfter} pages=${pages} listedTotal=${totalCount}`
    );
    return {
      mode: "poll",
      createdAfter,
      lookbackHours,
      maxPerRun,
      driveId: root.driveId || null,
      rootName: root.name,
      rootId: root.id,
      flatten,
      pages,
      listedTotal: totalCount || listed.length,
      archived,
      skipped,
      skippedInternal,
      deferred,
      sample: listed.slice(0, 8).map((r) => {
        const vis = classifyExternal(r);
        return {
          id: r.id,
          title: r.title,
          state: r.state,
          meetingType: vis.meetingType,
          reason: vis.reason,
          channel: r.channel?.name ?? null,
          companies: (r.companies || []).map((c) => c.name),
          participantEmails: (r.meeting?.participants || []).map((p) => p.email).filter(Boolean),
        };
      }),
      notes: {
        privateRecordings:
          "Claap API omits recordings that are not visible in global search / member-accessible channels. Do not try to fetch them.",
        dustDomain: DUST_DOMAIN,
        meetingTypeField:
          'recording.meeting.type is "external" if at least one participant is outside the org, else "internal".',
        layout: "Files live directly in Claap Recordings/. Per-recorder email folders are flattened and removed.",
      },
      results,
    };
  },
});
