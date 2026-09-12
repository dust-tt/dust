export type ClaapPerson = {
  attended: boolean;
  email?: string;
  id?: string;
  name?: string;
};

export type ClaapTranscriptSegment = {
  startedAt: number;
  endedAt: number;
  speaker?: string;
  text: string;
  languageCode?: string;
};

export type ClaapTranscript = {
  languageCode?: string;
  segments: ClaapTranscriptSegment[];
};

export type ClaapRecordingState = "Empty" | "Uploaded" | "Ready" | "Failed";

export type ClaapRecording = {
  id: string;
  state: ClaapRecordingState;
  title?: string;
  createdAt: string;
  durationSeconds?: number;
  source?: string;
  url: string;
  transcriptOnly?: boolean;
  labels?: string[];
  recorder: ClaapPerson & { email: string; id: string; name: string };
  channel?: { id: string; name: string };
  workspace: { id: string; name: string };
  meeting?: {
    conferenceUrl?: string;
    startingAt: string;
    endingAt: string;
    type: "internal" | "external";
    participants: ClaapPerson[];
  };
  companies?: { id: string; name: string }[];
  deal?: { id: string; name?: string };
  crmInfo?: { crm: string; deal?: { id: string } };
  video?: { url?: string };
  transcripts?: Array<{
    isActive?: boolean;
    isTranscript?: boolean;
    langIso2?: string;
    textUrl: string;
    url: string;
  }>;
  actionItems?: unknown;
  aiFields?: unknown;
  analytics?: unknown;
  keyTakeaways?: unknown;
  outlines?: unknown;
};

export type ClaapWebhookEvent = {
  eventId: string;
  event: {
    type: "recording_added" | "recording_updated";
    recording: ClaapRecording;
  };
};

export type ArchiveResult =
  | {
      status: "archived";
      recordingId: string;
      folderId: string;
      markdownFileId: string;
      jsonFileId: string;
      videoFileId?: string;
    }
  | { status: "skipped"; recordingId?: string; reason: string };

export type DriveFile = {
  id: string;
  name?: string;
  webViewLink?: string;
};

export type DrivePort = {
  ensureFolder(parentId: string, name: string): Promise<string>;
  upsertFile(input: {
    parentId: string;
    name: string;
    mimeType: string;
    content: Buffer | string;
    appProperties: Record<string, string>;
  }): Promise<DriveFile>;
  upsertMedia(input: {
    parentId: string;
    name: string;
    mimeType: string;
    body: NodeJS.ReadableStream | Buffer;
    appProperties: Record<string, string>;
  }): Promise<DriveFile>;
};

export type ClaapPort = {
  getRecording(recordingId: string): Promise<ClaapRecording>;
  getTranscript(recordingId: string): Promise<ClaapTranscript>;
  listRecordings(params?: {
    createdAfter?: string;
    createdBefore?: string;
    cursor?: string;
    limit?: number;
    recorderEmail?: string;
  }): Promise<{
    recordings: ClaapRecording[];
    nextCursor?: string;
  }>;
};

export type ArchiveOptions = {
  rootFolderId: string;
  uploadVideo: boolean;
  maxVideoBytes: number;
  fetchVideo?: (url: string) => Promise<{
    body: Buffer;
    mimeType: string;
    byteLength: number;
  }>;
};
