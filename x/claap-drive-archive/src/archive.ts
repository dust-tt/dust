import { buildArchiveJson, buildArchiveMarkdown } from "./document.ts";
import {
  archiveBaseName,
  recorderFolderName,
  videoExtension,
} from "./filenames.ts";
import type {
  ArchiveOptions,
  ArchiveResult,
  ClaapPort,
  ClaapRecording,
  ClaapTranscript,
  DrivePort,
} from "./types.ts";

const DEFAULT_VIDEO_MIME = "video/mp4";

async function loadTranscript(
  claap: ClaapPort,
  recording: ClaapRecording
): Promise<ClaapTranscript | null> {
  try {
    return await claap.getTranscript(recording.id);
  } catch (error) {
    if (recording.transcripts && recording.transcripts.length > 0) {
      return null;
    }
    throw error;
  }
}

async function maybeUploadVideo(input: {
  drive: DrivePort;
  folderId: string;
  recording: ClaapRecording;
  baseName: string;
  options: ArchiveOptions;
}): Promise<string | undefined> {
  const { drive, folderId, recording, baseName, options } = input;
  if (!options.uploadVideo || recording.transcriptOnly || !recording.video?.url) {
    return undefined;
  }
  if (!options.fetchVideo) {
    throw new Error("uploadVideo is enabled but no fetchVideo implementation was provided");
  }

  const video = await options.fetchVideo(recording.video.url);
  if (video.byteLength === 0) {
    return undefined;
  }
  if (video.byteLength > options.maxVideoBytes) {
    return undefined;
  }

  const mimeType = video.mimeType || DEFAULT_VIDEO_MIME;
  const file = await drive.upsertMedia({
    parentId: folderId,
    name: `${baseName}.${videoExtension(mimeType)}`,
    mimeType,
    body: video.body,
    appProperties: {
      claapRecordingId: recording.id,
      kind: "video",
    },
  });
  return file.id;
}

export async function archiveRecording(input: {
  claap: ClaapPort;
  drive: DrivePort;
  recordingId: string;
  options: ArchiveOptions;
}): Promise<ArchiveResult> {
  const recording = await input.claap.getRecording(input.recordingId);
  if (recording.state !== "Ready") {
    return {
      status: "skipped",
      recordingId: recording.id,
      reason: `recording state is ${recording.state}`,
    };
  }

  const transcript = await loadTranscript(input.claap, recording);
  const markdown = buildArchiveMarkdown({ recording, transcript });
  const json = buildArchiveJson({ recording, transcript });
  const folderId = await input.drive.ensureFolder(
    input.options.rootFolderId,
    recorderFolderName(recording)
  );
  const baseName = archiveBaseName(recording);

  const markdownFile = await input.drive.upsertFile({
    parentId: folderId,
    name: `${baseName}.md`,
    mimeType: "text/markdown",
    content: markdown,
    appProperties: {
      claapRecordingId: recording.id,
      kind: "transcript",
    },
  });

  const jsonFile = await input.drive.upsertFile({
    parentId: folderId,
    name: `${baseName}.json`,
    mimeType: "application/json",
    content: json,
    appProperties: {
      claapRecordingId: recording.id,
      kind: "raw",
    },
  });

  const videoFileId = await maybeUploadVideo({
    drive: input.drive,
    folderId,
    recording,
    baseName,
    options: input.options,
  });

  return {
    status: "archived",
    recordingId: recording.id,
    folderId,
    markdownFileId: markdownFile.id,
    jsonFileId: jsonFile.id,
    videoFileId,
  };
}

export async function archiveRecordingsSince(input: {
  claap: ClaapPort;
  drive: DrivePort;
  createdAfter: string;
  options: ArchiveOptions;
}): Promise<ArchiveResult[]> {
  const results: ArchiveResult[] = [];
  let cursor: string | undefined;

  do {
    const page = await input.claap.listRecordings({
      createdAfter: input.createdAfter,
      cursor,
      limit: 50,
    });
    for (const recording of page.recordings) {
      results.push(
        await archiveRecording({
          claap: input.claap,
          drive: input.drive,
          recordingId: recording.id,
          options: input.options,
        })
      );
    }
    cursor = page.nextCursor;
  } while (cursor);

  return results;
}
