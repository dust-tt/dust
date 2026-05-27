import type { Logger } from "@connectors/logger/logger";
import type { DataSourceConfig, GoogleDriveObjectType } from "@connectors/types";
import { describe, expect, it, vi } from "vitest";
import type { OAuth2Client } from "googleapis-common";

const mocks = vi.hoisted(() => ({
  handleFileExport: vi.fn(),
  handleGoogleDriveExport: vi.fn(),
  updateGoogleDriveFiles: vi.fn(),
  upsertGdriveDocument: vi.fn(),
}));

vi.mock(
  "@connectors/connectors/google_drive/temporal/file/handle_file_export",
  () => ({
    handleFileExport: mocks.handleFileExport,
  })
);

vi.mock(
  "@connectors/connectors/google_drive/temporal/file/handle_google_drive_export",
  () => ({
    handleGoogleDriveExport: mocks.handleGoogleDriveExport,
  })
);

vi.mock(
  "@connectors/connectors/google_drive/temporal/file/update_google_drive_files",
  () => ({
    updateGoogleDriveFiles: mocks.updateGoogleDriveFiles,
  })
);

vi.mock(
  "@connectors/connectors/google_drive/temporal/file/upsert_gdrive_document",
  () => ({
    upsertGdriveDocument: mocks.upsertGdriveDocument,
  })
);

import { syncOneFileTextDocument } from "./sync_one_file_text_document";

const dataSourceConfig: DataSourceConfig = {
  dataSourceId: "data-source-id",
  workspaceAPIKey: "workspace-api-key",
  workspaceId: "workspace-id",
};

const localLogger = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
} as unknown as Logger;

const oauth2Client = {} as OAuth2Client;

function makeGoogleDriveFile(): GoogleDriveObjectType {
  return {
    capabilities: {
      canDownload: true,
    },
    createdAtMs: Date.now(),
    driveId: "drive-1",
    id: "file-1",
    isInSharedDrive: false,
    labels: [],
    mimeType: "application/vnd.google-apps.document",
    name: "Empty Doc",
    parent: "parent-1",
    size: null,
    trashed: false,
  };
}

describe("syncOneFileTextDocument", () => {
  it("returns false when an exported Google document has no content", async () => {
    mocks.handleGoogleDriveExport.mockResolvedValue({
      content: null,
    });

    const result = await syncOneFileTextDocument(
      1,
      oauth2Client,
      makeGoogleDriveFile(),
      localLogger,
      null,
      dataSourceConfig,
      Date.now(),
      false,
      1000
    );

    expect(result).toBe(false);
    expect(mocks.upsertGdriveDocument).not.toHaveBeenCalled();
    expect(mocks.updateGoogleDriveFiles).not.toHaveBeenCalled();
  });
});
