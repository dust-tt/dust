import { randomUUID } from "node:crypto";

import { GoogleDriveFilesModel } from "@connectors/lib/models/google_drive";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GoogleDriveObjectType } from "@connectors/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthObject: vi.fn(),
  getFileParentsMemoized: vi.fn(),
  getGoogleDriveObject: vi.fn(),
  syncOneFile: vi.fn(),
  upsertDataSourceFolder: vi.fn(),
}));

vi.mock("@connectors/connectors/google_drive", () => ({
  getSourceUrlForGoogleDriveFiles: (file: {
    driveFileId?: string;
    id?: string;
  }) =>
    `https://drive.google.com/drive/folders/${
      "driveFileId" in file ? file.driveFileId : file.id
    }`,
}));

vi.mock("@connectors/connectors/google_drive/lib/google_drive_api", () => ({
  getGoogleDriveObject: mocks.getGoogleDriveObject,
}));

vi.mock("@connectors/connectors/google_drive/lib/hierarchy", () => ({
  getFileParentsMemoized: mocks.getFileParentsMemoized,
}));

vi.mock("@connectors/connectors/google_drive/temporal/client", () => ({
  launchGoogleDriveFullSyncWorkflow: vi.fn(),
  launchGoogleDriveIncrementalSyncWorkflow: vi.fn(),
  launchGoogleFixParentsConsistencyWorkflow: vi.fn(),
}));

vi.mock("@connectors/connectors/google_drive/temporal/file", () => ({
  syncOneFile: mocks.syncOneFile,
}));

vi.mock(
  "@connectors/connectors/google_drive/temporal/utils",
  async (importOriginal) => {
    const mod =
      await importOriginal<
        typeof import("@connectors/connectors/google_drive/temporal/utils")
      >();

    return {
      ...mod,
      getAuthObject: mocks.getAuthObject,
    };
  }
);

vi.mock("@connectors/lib/data_sources", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@connectors/lib/data_sources")>();

  return {
    ...mod,
    upsertDataSourceFolder: mocks.upsertDataSourceFolder,
  };
});

vi.mock("@connectors/lib/temporal", () => ({
  terminateWorkflow: vi.fn(),
}));

vi.mock("@connectors/logger/logger", () => ({
  default: {
    child: vi.fn(() => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    })),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  getActivityLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
  getLoggerArgs: vi.fn(() => ({})),
}));

import { google_drive } from "./cli";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

function makeGoogleDriveFolder({
  id,
  name,
  parent,
}: {
  id: string;
  name: string;
  parent: string | null;
}): GoogleDriveObjectType {
  return {
    capabilities: {
      canDownload: false,
    },
    createdAtMs: Date.now(),
    driveId: "drive-1",
    id,
    isInSharedDrive: false,
    labels: [],
    mimeType: FOLDER_MIME_TYPE,
    name,
    parent,
    size: null,
    trashed: false,
  };
}

async function makeConnector(suffix: string) {
  return ConnectorResource.makeNew(
    "google_drive",
    {
      connectionId: `connection-${suffix}`,
      dataSourceId: `data-source-${suffix}`,
      workspaceAPIKey: `api-key-${suffix}`,
      workspaceId: `workspace-${suffix}`,
    },
    {
      csvEnabled: false,
      largeFilesEnabled: false,
      pdfEnabled: false,
    }
  );
}

describe("google drive admin cli", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getAuthObject.mockResolvedValue({});
    mocks.syncOneFile.mockResolvedValue(true);
    mocks.upsertDataSourceFolder.mockReset();
  });

  it("refreshes stale folder metadata when upserting a folder", async () => {
    const suffix = randomUUID();
    const folderId = `folder-${suffix}`;
    const parentId = `parent-${suffix}`;
    const rootId = `root-${suffix}`;
    const connector = await makeConnector(suffix);
    const previousLastSeenTs = new Date("2025-01-01T00:00:00.000Z");

    await GoogleDriveFilesModel.bulkCreate([
      {
        connectorId: connector.id,
        driveFileId: folderId,
        dustFileId: `gdrive-${folderId}`,
        lastSeenTs: previousLastSeenTs,
        mimeType: FOLDER_MIME_TYPE,
        name: "Stale Folder Name",
        parentId,
      },
      {
        connectorId: connector.id,
        driveFileId: parentId,
        dustFileId: `gdrive-${parentId}`,
        lastSeenTs: previousLastSeenTs,
        mimeType: FOLDER_MIME_TYPE,
        name: "Stale Parent Name",
        parentId: rootId,
      },
    ]);

    const folder = makeGoogleDriveFolder({
      id: folderId,
      name: "Current Folder Name",
      parent: parentId,
    });
    const parent = makeGoogleDriveFolder({
      id: parentId,
      name: "Current Parent Name",
      parent: rootId,
    });
    const root = makeGoogleDriveFolder({
      id: rootId,
      name: "Current Root Name",
      parent: null,
    });
    const remoteFiles = new Map([
      [folderId, folder],
      [parentId, parent],
      [rootId, root],
    ]);

    mocks.getGoogleDriveObject.mockImplementation(({ driveObjectId }) => {
      return remoteFiles.get(driveObjectId) ?? null;
    });
    mocks.getFileParentsMemoized.mockImplementation(
      (
        _connectorId: number,
        _authCredentials: unknown,
        file: GoogleDriveObjectType
      ) => {
        if (file.id === folderId) {
          return [folderId, parentId, rootId];
        }
        if (file.id === parentId) {
          return [parentId, rootId];
        }
        return [rootId];
      }
    );

    const result = await google_drive({
      majorCommand: "google_drive",
      command: "upsert-file",
      args: {
        connectorId: connector.id.toString(),
        fileId: folderId,
      },
    });

    const updatedFolder = await GoogleDriveFilesModel.findOne({
      where: {
        connectorId: connector.id,
        driveFileId: folderId,
      },
    });
    const updatedParent = await GoogleDriveFilesModel.findOne({
      where: {
        connectorId: connector.id,
        driveFileId: parentId,
      },
    });

    expect(result).toEqual({ success: true });
    expect(updatedFolder?.name).toBe("Current Folder Name");
    expect(updatedFolder?.parentId).toBe(parentId);
    expect(updatedFolder?.lastSeenTs?.getTime()).toBeGreaterThan(
      previousLastSeenTs.getTime()
    );
    expect(updatedParent?.name).toBe("Current Parent Name");
    expect(mocks.syncOneFile).not.toHaveBeenCalled();
    expect(mocks.upsertDataSourceFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: `gdrive-${folderId}`,
        parentId: `gdrive-${parentId}`,
        parents: [
          `gdrive-${folderId}`,
          `gdrive-${parentId}`,
          `gdrive-${rootId}`,
        ],
        title: "Current Folder Name",
      })
    );
  });
});
