import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { archiveRecording, archiveRecordingsSince } from "../src/archive.ts";
import type { ClaapPort, ClaapRecording, DrivePort } from "../src/types.ts";
import { makeRecording, makeTranscript } from "./fixtures.ts";

function createMocks(recordings: ClaapRecording[]) {
  const folders = new Map<string, string>();
  const files: Array<{
    parentId: string;
    name: string;
    mimeType: string;
    content: string;
    appProperties: Record<string, string>;
  }> = [];

  const claap: ClaapPort = {
    async getRecording(recordingId) {
      const recording = recordings.find((item) => item.id === recordingId);
      if (!recording) {
        throw new Error(`missing recording ${recordingId}`);
      }
      return recording;
    },
    async getTranscript() {
      return makeTranscript();
    },
    async listRecordings() {
      return { recordings };
    },
  };

  const drive: DrivePort = {
    async ensureFolder(parentId, name) {
      const key = `${parentId}/${name}`;
      const existing = folders.get(key);
      if (existing) {
        return existing;
      }
      const id = `folder_${folders.size + 1}`;
      folders.set(key, id);
      return id;
    },
    async upsertFile(input) {
      const content = typeof input.content === "string" ? input.content : input.content.toString("utf8");
      const existing = files.findIndex(
        (file) =>
          file.appProperties.claapRecordingId === input.appProperties.claapRecordingId &&
          file.appProperties.kind === input.appProperties.kind
      );
      const stored = {
        parentId: input.parentId,
        name: input.name,
        mimeType: input.mimeType,
        content,
        appProperties: input.appProperties,
      };
      if (existing >= 0) {
        files[existing] = stored;
        return { id: `file_${existing + 1}` };
      }
      files.push(stored);
      return { id: `file_${files.length}` };
    },
    async upsertMedia(input) {
      return this.upsertFile({
        ...input,
        content: Buffer.isBuffer(input.body) ? input.body : Buffer.from("video"),
      });
    },
  };

  return { claap, drive, files, folders };
}

describe("archiveRecording", () => {
  it("writes markdown and json under the recorder folder", async () => {
    const recording = makeRecording();
    const { claap, drive, files, folders } = createMocks([recording]);

    const result = await archiveRecording({
      claap,
      drive,
      recordingId: recording.id,
      options: {
        rootFolderId: "root",
        uploadVideo: false,
        maxVideoBytes: 1,
      },
    });

    assert.equal(result.status, "archived");
    assert.equal(folders.get("root/ilias@dust.tt"), "folder_1");
    assert.equal(files.length, 2);
    assert.equal(files[0]?.name.endsWith(".md"), true);
    assert.equal(files[1]?.name.endsWith(".json"), true);
    assert.match(files[0]?.content ?? "", /# Transcript/);
    assert.doesNotMatch(files[0]?.content ?? "", /MEDICC/);
    assert.match(files[1]?.content ?? "", /"id": "rec_abc123"/);
  });

  it("skips recordings that are not ready", async () => {
    const recording = makeRecording({ state: "Uploaded" });
    const { claap, drive, files } = createMocks([recording]);

    const result = await archiveRecording({
      claap,
      drive,
      recordingId: recording.id,
      options: { rootFolderId: "root", uploadVideo: false, maxVideoBytes: 1 },
    });

    assert.deepEqual(result, {
      status: "skipped",
      recordingId: recording.id,
      reason: "recording state is Uploaded",
    });
    assert.equal(files.length, 0);
  });

  it("upserts the same recording instead of duplicating files", async () => {
    const recording = makeRecording();
    const { claap, drive, files } = createMocks([recording]);
    const options = { rootFolderId: "root", uploadVideo: false, maxVideoBytes: 1 };

    await archiveRecording({ claap, drive, recordingId: recording.id, options });
    await archiveRecording({ claap, drive, recordingId: recording.id, options });

    assert.equal(files.length, 2);
  });

  it("archives a page of recordings during backfill", async () => {
    const recordings = [
      makeRecording({ id: "rec_1" }),
      makeRecording({ id: "rec_2", recorder: { ...makeRecording().recorder, email: "iris@dust.tt" } }),
    ];
    const { claap, drive, files, folders } = createMocks(recordings);

    const results = await archiveRecordingsSince({
      claap,
      drive,
      createdAfter: "2026-09-01T00:00:00.000Z",
      options: { rootFolderId: "root", uploadVideo: false, maxVideoBytes: 1 },
    });

    assert.equal(results.length, 2);
    assert.equal(folders.get("root/iris@dust.tt"), "folder_2");
    assert.equal(files.length, 4);
  });
});
