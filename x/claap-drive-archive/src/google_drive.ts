import { google, type drive_v3 } from "googleapis";

import type { DrivePort } from "./types.ts";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function driveQueryEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function createGoogleDrivePort(input: {
  drive?: drive_v3.Drive;
  accessToken?: string;
}): DrivePort {
  let drive = input.drive;
  if (!drive && input.accessToken) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: input.accessToken });
    drive = google.drive({ version: "v3", auth });
  }
  if (!drive) {
    throw new Error("Google Drive client requires drive or accessToken");
  }
  const driveClient = drive;

  async function findFile(query: string): Promise<drive_v3.Schema$File | null> {
    const response = await driveClient.files.list({
      q: query,
      fields: "files(id,name,webViewLink)",
      pageSize: 1,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    return response.data.files?.[0] ?? null;
  }

  return {
    async ensureFolder(parentId, name) {
      const existing = await findFile(
        `mimeType = '${FOLDER_MIME}' and name = '${driveQueryEscape(name)}' and '${driveQueryEscape(parentId)}' in parents and trashed = false`
      );
      if (existing?.id) {
        return existing.id;
      }

      const created = await driveClient.files.create({
        requestBody: {
          name,
          mimeType: FOLDER_MIME,
          parents: [parentId],
        },
        fields: "id",
        supportsAllDrives: true,
      });
      if (!created.data.id) {
        throw new Error(`Failed to create Drive folder ${name}`);
      }
      return created.data.id;
    },

    async upsertFile({ parentId, name, mimeType, content, appProperties }) {
      const recordingId = appProperties.claapRecordingId;
      const kind = appProperties.kind;
      const existing = recordingId
        ? await findFile(
            `appProperties has { key='claapRecordingId' and value='${driveQueryEscape(recordingId)}' } and appProperties has { key='kind' and value='${driveQueryEscape(kind)}' } and '${driveQueryEscape(parentId)}' in parents and trashed = false`
          )
        : null;

      const media = {
        mimeType,
        body: typeof content === "string" ? content : content,
      };

      if (existing?.id) {
        const updated = await driveClient.files.update({
          fileId: existing.id,
          requestBody: { name, appProperties },
          media,
          fields: "id,name,webViewLink",
          supportsAllDrives: true,
        });
        return {
          id: updated.data.id ?? existing.id,
          name: updated.data.name ?? name,
          webViewLink: updated.data.webViewLink ?? undefined,
        };
      }

      const created = await driveClient.files.create({
        requestBody: {
          name,
          mimeType,
          parents: [parentId],
          appProperties,
        },
        media,
        fields: "id,name,webViewLink",
        supportsAllDrives: true,
      });
      if (!created.data.id) {
        throw new Error(`Failed to create Drive file ${name}`);
      }
      return {
        id: created.data.id,
        name: created.data.name ?? name,
        webViewLink: created.data.webViewLink ?? undefined,
      };
    },

    async upsertMedia({ parentId, name, mimeType, body, appProperties }) {
      return this.upsertFile({
        parentId,
        name,
        mimeType,
        content: typeof body === "object" && Buffer.isBuffer(body) ? body : await streamToBuffer(body),
        appProperties,
      });
    },
  };
}

async function streamToBuffer(
  body: NodeJS.ReadableStream | Buffer
): Promise<Buffer> {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function createGoogleDrivePortFromAdc(): DrivePort {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return createGoogleDrivePort({
    drive: google.drive({ version: "v3", auth }),
  });
}
