import logger from "@connectors/logger/logger";
import type { DataSourceConfig, GoogleDriveObjectType } from "@connectors/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "googleapis-common";

const mocks = vi.hoisted(() => ({
  handleFileExportWithResult: vi.fn(),
  syncSpreadSheet: vi.fn(),
  updateGoogleDriveFiles: vi.fn(),
}));

vi.mock(
  "@connectors/connectors/google_drive/temporal/file/handle_file_export",
  () => ({
    handleFileExportWithResult: mocks.handleFileExportWithResult,
  })
);

vi.mock(
  "@connectors/connectors/google_drive/temporal/file/update_google_drive_files",
  () => ({
    updateGoogleDriveFiles: mocks.updateGoogleDriveFiles,
  })
);

vi.mock(
  "@connectors/connectors/google_drive/temporal/spreadsheets",
  () => ({
    syncSpreadSheet: mocks.syncSpreadSheet,
  })
);

import { syncOneFileTable } from "./sync_one_file_table";

const dataSourceConfig: DataSourceConfig = {
  dataSourceId: "data-source-id",
  workspaceAPIKey: "workspace-api-key",
  workspaceId: "workspace-id",
};

const oauth2Client = new OAuth2Client();

function makeGoogleDriveCsvFile(): GoogleDriveObjectType {
  return {
    capabilities: {
      canDownload: true,
    },
    createdAtMs: Date.now(),
    driveId: "drive-1",
    id: "file-1",
    isInSharedDrive: false,
    labels: [],
    mimeType: "text/csv",
    name: "Table.csv",
    parent: "parent-1",
    size: null,
    trashed: false,
  };
}

function makeGoogleDriveSpreadsheetFile(): GoogleDriveObjectType {
  return {
    capabilities: {
      canDownload: true,
    },
    createdAtMs: Date.now(),
    driveId: "drive-1",
    id: "spreadsheet-1",
    isInSharedDrive: false,
    labels: [],
    mimeType: "application/vnd.google-apps.spreadsheet",
    name: "Budget",
    parent: "parent-1",
    size: null,
    trashed: false,
  };
}

describe("syncOneFileTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when a CSV export is skipped", async () => {
    const file = makeGoogleDriveCsvFile();
    mocks.handleFileExportWithResult.mockResolvedValue({
      documentContent: null,
      didProcessContent: false,
    });

    const result = await syncOneFileTable(
      1,
      oauth2Client,
      file,
      logger,
      dataSourceConfig,
      1000,
      Date.now()
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

  it("returns true when a CSV import succeeds", async () => {
    mocks.handleFileExportWithResult.mockResolvedValue({
      documentContent: null,
      didProcessContent: true,
    });

    const result = await syncOneFileTable(
      1,
      oauth2Client,
      makeGoogleDriveCsvFile(),
      logger,
      dataSourceConfig,
      1000,
      Date.now()
    );

    expect(result).toBe(true);
  });

  it("returns false when a Google spreadsheet sync skips table imports", async () => {
    mocks.syncSpreadSheet.mockResolvedValue({
      didSyncFile: false,
      isSupported: true,
    });

    const result = await syncOneFileTable(
      1,
      oauth2Client,
      makeGoogleDriveSpreadsheetFile(),
      logger,
      dataSourceConfig,
      1000,
      Date.now()
    );

    expect(result).toBe(false);
  });

  it("returns true when a Google spreadsheet sync imports a table", async () => {
    mocks.syncSpreadSheet.mockResolvedValue({
      didSyncFile: true,
      isSupported: true,
    });

    const result = await syncOneFileTable(
      1,
      oauth2Client,
      makeGoogleDriveSpreadsheetFile(),
      logger,
      dataSourceConfig,
      1000,
      Date.now()
    );

    expect(result).toBe(true);
  });
});
