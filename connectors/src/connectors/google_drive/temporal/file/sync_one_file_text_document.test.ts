import logger from "@connectors/logger/logger";
import type {
  DataSourceConfig,
  GoogleDriveObjectType,
} from "@connectors/types";
import { OAuth2Client } from "googleapis-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const oauth2Client = new OAuth2Client();

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when an exported Google document has no content", async () => {
    mocks.handleGoogleDriveExport.mockResolvedValue({
      content: null,
    });

    const result = await syncOneFileTextDocument(
      1,
      oauth2Client,
      makeGoogleDriveFile(),
      logger,
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

  it("returns false when the upsert helper skips the document", async () => {
    const file = makeGoogleDriveFile();

    mocks.handleGoogleDriveExport.mockResolvedValue({
      content: {
        content: "content",
        prefix: null,
        sections: [],
      },
    });
    mocks.upsertGdriveDocument.mockResolvedValue({
      didUpsert: false,
    });

    const result = await syncOneFileTextDocument(
      1,
      oauth2Client,
      file,
      logger,
      null,
      dataSourceConfig,
      Date.now(),
      false,
      1000
    );

    expect(result).toBe(false);
    expect(mocks.updateGoogleDriveFiles).toHaveBeenCalledWith(
      1,
      "gdrive-file-1",
      file,
      undefined,
      undefined
    );
  });
});
