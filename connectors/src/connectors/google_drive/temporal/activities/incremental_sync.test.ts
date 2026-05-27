import { randomUUID } from "node:crypto";

import {
  GoogleDriveFilesModel,
  GoogleDriveSyncTokenModel,
} from "@connectors/lib/models/google_drive";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GoogleDriveObjectType } from "@connectors/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GaxiosError } from "googleapis-common";

const mocks = vi.hoisted(() => ({
  changeList: vi.fn(),
  deleteFile: vi.fn(),
  deleteOneFile: vi.fn(),
  driveObjectToDustType: vi.fn(),
  getAuthObject: vi.fn(),
  getCachedLabels: vi.fn(),
  getDriveClient: vi.fn(),
  getFileParentsMemoized: vi.fn(),
  getFoldersToSync: vi.fn(),
  getSyncPageToken: vi.fn(),
  heartbeat: vi.fn(),
  isSharedDriveNotFoundError: vi.fn(),
  objectIsInFolderSelection: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  syncOneFile: vi.fn(),
  updateDataSourceDocumentParents: vi.fn(),
  updateDataSourceTableParents: vi.fn(),
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
  getGoogleDriveObject: vi.fn(),
}));

vi.mock("@connectors/connectors/google_drive/lib/hierarchy", () => ({
  getFileParentsMemoized: mocks.getFileParentsMemoized,
}));

vi.mock(
  "@connectors/connectors/google_drive/temporal/activities/common/utils",
  () => ({
    deleteFile: mocks.deleteFile,
    deleteOneFile: mocks.deleteOneFile,
    GOOGLE_DRIVE_INACCESSIBLE_SYNC_TOKEN: "__dust_inaccessible_drive__",
    getSyncPageToken: mocks.getSyncPageToken,
    objectIsInFolderSelection: mocks.objectIsInFolderSelection,
  })
);

vi.mock(
  "@connectors/connectors/google_drive/temporal/activities/get_folders_to_sync",
  () => ({
    getFoldersToSync: mocks.getFoldersToSync,
  })
);

vi.mock("@connectors/connectors/google_drive/temporal/file", () => ({
  syncOneFile: mocks.syncOneFile,
}));

vi.mock("@connectors/connectors/google_drive/temporal/spreadsheets", () => ({
  deleteSpreadsheet: vi.fn(),
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
      driveObjectToDustType: mocks.driveObjectToDustType,
      getAuthObject: mocks.getAuthObject,
      getCachedLabels: mocks.getCachedLabels,
      getDriveClient: mocks.getDriveClient,
      isSharedDriveNotFoundError: mocks.isSharedDriveNotFoundError,
    };
  }
);

vi.mock("@connectors/lib/data_sources", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@connectors/lib/data_sources")>();

  return {
    ...mod,
    deleteDataSourceDocument: vi.fn(),
    deleteDataSourceFolder: vi.fn(),
    deleteDataSourceTable: vi.fn(),
    updateDataSourceDocumentParents: mocks.updateDataSourceDocumentParents,
    updateDataSourceTableParents: mocks.updateDataSourceTableParents,
    upsertDataSourceFolder: mocks.upsertDataSourceFolder,
  };
});

vi.mock("@connectors/lib/temporal", () => ({
  heartbeat: mocks.heartbeat,
}));

vi.mock("@connectors/logger/logger", () => ({
  default: {
    child: vi.fn(() => ({
      child: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    })),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  getActivityLogger: vi.fn(() => ({
    child: vi.fn(() => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    })),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
  getLoggerArgs: vi.fn(() => ({})),
}));

vi.mock("@connectors/types/shared/redis_client", () => ({
  redisClient: vi.fn(async () => ({
    get: mocks.redisGet,
    set: mocks.redisSet,
  })),
}));

import { incrementalSync } from "./incremental_sync";

function makeFolderChange(file: GoogleDriveObjectType) {
  return {
    changeType: "file" as const,
    file: {
      createdTime: new Date(file.createdAtMs).toISOString(),
      id: file.id,
      mimeType: file.mimeType,
      modifiedTime: new Date(file.createdAtMs).toISOString(),
      name: file.name,
      size: file.size ?? undefined,
      trashed: file.trashed,
    },
  };
}

function makeRemovedFileChange(fileId: string) {
  return {
    changeType: "file" as const,
    fileId,
    removed: true,
  };
}

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
      canDownload: true,
    },
    createdAtMs: Date.now(),
    driveId: "drive-1",
    id,
    isInSharedDrive: false,
    labels: [],
    mimeType: "application/vnd.google-apps.folder",
    name,
    parent,
    size: null,
    trashed: false,
  };
}

function makeGoogleDriveFile({
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
      canDownload: true,
    },
    createdAtMs: Date.now(),
    driveId: "drive-1",
    id,
    isInSharedDrive: false,
    labels: [],
    mimeType: "application/vnd.google-apps.document",
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

function mockRedisStore() {
  const redisStore = new Map<string, string>();

  mocks.redisGet.mockImplementation(async (key: string) => {
    return redisStore.get(key) ?? null;
  });
  mocks.redisSet.mockImplementation(async (key: string, value: string) => {
    redisStore.set(key, value);
    return "OK";
  });
}

function makeGoogleDriveError(status: number, reason: string) {
  return new GaxiosError(
    "Google Drive error",
    {},
    {
      config: {},
      data: {
        error: {
          errors: [{ reason }],
        },
      },
      headers: {},
      request: {
        responseURL: "https://www.googleapis.com/drive/v3/changes/startPageToken",
      },
      status,
      statusText: "Google Drive error",
    }
  );
}

describe("google drive incremental sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.changeList.mockReset();
    mocks.driveObjectToDustType.mockReset();
    mocks.getAuthObject.mockResolvedValue({});
    mocks.getCachedLabels.mockResolvedValue([]);
    mocks.getDriveClient.mockResolvedValue({
      changes: {
        list: mocks.changeList,
      },
    });
    mocks.getFileParentsMemoized.mockReset();
    mocks.getFoldersToSync.mockResolvedValue(["root-folder"]);
    mocks.getSyncPageToken.mockResolvedValue("page-token");
    mocks.isSharedDriveNotFoundError.mockReturnValue(false);
    mocks.objectIsInFolderSelection.mockResolvedValue(true);
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue("OK");
    mocks.syncOneFile.mockResolvedValue(true);
    mocks.upsertDataSourceFolder.mockReset();
    mocks.updateDataSourceDocumentParents.mockReset();
    mocks.updateDataSourceTableParents.mockReset();
  });

  it("updates existing folder titles when the folder is renamed in place", async () => {
    const suffix = randomUUID();
    const folderId = `folder-${suffix}`;
    const parentId = `parent-${suffix}`;
    const rootId = `root-${suffix}`;
    const connector = await makeConnector(suffix);
    const previousLastSeenTs = new Date("2025-01-01T00:00:00.000Z");

    await GoogleDriveFilesModel.create({
      connectorId: connector.id,
      driveFileId: folderId,
      dustFileId: `gdrive-${folderId}`,
      lastSeenTs: previousLastSeenTs,
      mimeType: "application/vnd.google-apps.folder",
      name: "Board Prez",
      parentId,
    });

    const driveFile = makeGoogleDriveFolder({
      id: folderId,
      name: "Board Presentations",
      parent: parentId,
    });

    mocks.changeList.mockResolvedValue({
      data: {
        changes: [makeFolderChange(driveFile)],
        newStartPageToken: "sync-token",
        nextPageToken: undefined,
      },
      status: 200,
    });
    mocks.driveObjectToDustType.mockResolvedValue(driveFile);
    mocks.getFileParentsMemoized.mockResolvedValue([
      folderId,
      parentId,
      rootId,
    ]);

    const result = await incrementalSync(
      connector.id,
      "drive-1",
      false,
      Date.now(),
      "page-token"
    );

    const folder = await GoogleDriveFilesModel.findOne({
      where: {
        connectorId: connector.id,
        driveFileId: folderId,
      },
    });

    expect(result).toEqual({
      hadRelevantChange: true,
      newFolders: [],
      nextPageToken: undefined,
    });
    expect(folder?.name).toBe("Board Presentations");
    expect(folder?.parentId).toBe(parentId);
    expect(folder?.lastSeenTs?.getTime()).toBeGreaterThan(
      previousLastSeenTs.getTime()
    );
    expect(mocks.upsertDataSourceFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: `gdrive-${folderId}`,
        parentId: `gdrive-${parentId}`,
        parents: [
          `gdrive-${folderId}`,
          `gdrive-${parentId}`,
          `gdrive-${rootId}`,
        ],
        title: "Board Presentations",
      })
    );
  });

  it("updates moved folder descendants before the moved folder retry marker", async () => {
    const suffix = randomUUID();
    const folderId = `folder-${suffix}`;
    const oldParentId = `old-parent-${suffix}`;
    const newParentId = `new-parent-${suffix}`;
    const rootId = `root-${suffix}`;
    const childFolderId = `child-folder-${suffix}`;
    const childFileId = `child-file-${suffix}`;
    const connector = await makeConnector(suffix);

    await GoogleDriveFilesModel.bulkCreate([
      {
        connectorId: connector.id,
        driveFileId: folderId,
        dustFileId: `gdrive-${folderId}`,
        mimeType: "application/vnd.google-apps.folder",
        name: "Team",
        parentId: oldParentId,
      },
      {
        connectorId: connector.id,
        driveFileId: childFolderId,
        dustFileId: `gdrive-${childFolderId}`,
        mimeType: "application/vnd.google-apps.folder",
        name: "Planning",
        parentId: folderId,
      },
      {
        connectorId: connector.id,
        driveFileId: childFileId,
        dustFileId: `gdrive-${childFileId}`,
        mimeType: "application/pdf",
        name: "Brief",
        parentId: childFolderId,
      },
    ]);

    const driveFile = makeGoogleDriveFolder({
      id: folderId,
      name: "Team",
      parent: newParentId,
    });

    mocks.changeList.mockResolvedValue({
      data: {
        changes: [makeFolderChange(driveFile)],
        newStartPageToken: "sync-token",
        nextPageToken: undefined,
      },
      status: 200,
    });
    mocks.driveObjectToDustType.mockResolvedValue(driveFile);
    mocks.getFileParentsMemoized.mockResolvedValue([
      folderId,
      newParentId,
      rootId,
    ]);

    const result = await incrementalSync(
      connector.id,
      "drive-1",
      false,
      Date.now(),
      "page-token"
    );

    const folder = await GoogleDriveFilesModel.findOne({
      where: {
        connectorId: connector.id,
        driveFileId: folderId,
      },
    });
    const childFolder = await GoogleDriveFilesModel.findOne({
      where: {
        connectorId: connector.id,
        driveFileId: childFolderId,
      },
    });
    const childFile = await GoogleDriveFilesModel.findOne({
      where: {
        connectorId: connector.id,
        driveFileId: childFileId,
      },
    });

    expect(result).toEqual({
      hadRelevantChange: true,
      newFolders: [],
      nextPageToken: undefined,
    });
    expect(folder?.parentId).toBe(newParentId);
    expect(childFolder?.parentId).toBe(folderId);
    expect(childFile?.parentId).toBe(childFolderId);
    expect(mocks.updateDataSourceDocumentParents).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: `gdrive-${childFileId}`,
        parentId: `gdrive-${childFolderId}`,
        parents: [
          `gdrive-${childFileId}`,
          `gdrive-${childFolderId}`,
          `gdrive-${folderId}`,
          `gdrive-${newParentId}`,
          `gdrive-${rootId}`,
        ],
      })
    );
    expect(
      mocks.upsertDataSourceFolder.mock.calls.map(([args]) => args.folderId)
    ).toEqual([`gdrive-${childFolderId}`, `gdrive-${folderId}`]);
  });

  it("does not move the folder retry marker when a descendant parent update fails", async () => {
    const suffix = randomUUID();
    const folderId = `folder-${suffix}`;
    const oldParentId = `old-parent-${suffix}`;
    const newParentId = `new-parent-${suffix}`;
    const rootId = `root-${suffix}`;
    const childFileId = `child-file-${suffix}`;
    const connector = await makeConnector(suffix);

    await GoogleDriveFilesModel.bulkCreate([
      {
        connectorId: connector.id,
        driveFileId: folderId,
        dustFileId: `gdrive-${folderId}`,
        mimeType: "application/vnd.google-apps.folder",
        name: "Team",
        parentId: oldParentId,
      },
      {
        connectorId: connector.id,
        driveFileId: childFileId,
        dustFileId: `gdrive-${childFileId}`,
        mimeType: "application/pdf",
        name: "Brief",
        parentId: folderId,
      },
    ]);

    const driveFile = makeGoogleDriveFolder({
      id: folderId,
      name: "Team",
      parent: newParentId,
    });

    mocks.changeList.mockResolvedValue({
      data: {
        changes: [makeFolderChange(driveFile)],
        newStartPageToken: "sync-token",
        nextPageToken: undefined,
      },
      status: 200,
    });
    mocks.driveObjectToDustType.mockResolvedValue(driveFile);
    mocks.getFileParentsMemoized.mockResolvedValue([
      folderId,
      newParentId,
      rootId,
    ]);
    mocks.updateDataSourceDocumentParents.mockRejectedValueOnce(
      new Error("parent update failed")
    );

    await expect(
      incrementalSync(connector.id, "drive-1", false, Date.now(), "page-token")
    ).rejects.toThrow("parent update failed");

    const folder = await GoogleDriveFilesModel.findOne({
      where: {
        connectorId: connector.id,
        driveFileId: folderId,
      },
    });

    expect(folder?.parentId).toBe(oldParentId);
    expect(mocks.upsertDataSourceFolder).not.toHaveBeenCalled();
  });

  it("keeps skipped folders out of the datasource when renamed in place", async () => {
    const suffix = randomUUID();
    const folderId = `folder-${suffix}`;
    const parentId = `parent-${suffix}`;
    const rootId = `root-${suffix}`;
    const connector = await makeConnector(suffix);
    const previousLastSeenTs = new Date("2025-01-01T00:00:00.000Z");

    await GoogleDriveFilesModel.create({
      connectorId: connector.id,
      driveFileId: folderId,
      dustFileId: `gdrive-${folderId}`,
      lastSeenTs: previousLastSeenTs,
      mimeType: "application/vnd.google-apps.folder",
      name: "Board Prez",
      parentId,
      skipReason: "blacklisted",
    });

    const driveFile = makeGoogleDriveFolder({
      id: folderId,
      name: "Board Presentations",
      parent: parentId,
    });

    mocks.changeList.mockResolvedValue({
      data: {
        changes: [makeFolderChange(driveFile)],
        newStartPageToken: "sync-token",
        nextPageToken: undefined,
      },
      status: 200,
    });
    mocks.driveObjectToDustType.mockResolvedValue(driveFile);
    mocks.getFileParentsMemoized.mockResolvedValue([
      folderId,
      parentId,
      rootId,
    ]);

    await incrementalSync(
      connector.id,
      "drive-1",
      false,
      Date.now(),
      "page-token"
    );

    const folder = await GoogleDriveFilesModel.findOne({
      where: {
        connectorId: connector.id,
        driveFileId: folderId,
      },
    });

    expect(folder?.name).toBe("Board Presentations");
    expect(folder?.lastSeenTs?.getTime()).toBeGreaterThan(
      previousLastSeenTs.getTime()
    );
    expect(mocks.upsertDataSourceFolder).not.toHaveBeenCalled();
  });

  it("keeps treating unseen folders as new folders to batch sync", async () => {
    const suffix = randomUUID();
    const folderId = `folder-${suffix}`;
    const parentId = `parent-${suffix}`;
    const rootId = `root-${suffix}`;
    const connector = await makeConnector(suffix);
    const driveFile = makeGoogleDriveFolder({
      id: folderId,
      name: "Board Presentations",
      parent: parentId,
    });

    mocks.changeList.mockResolvedValue({
      data: {
        changes: [makeFolderChange(driveFile)],
        newStartPageToken: "sync-token",
        nextPageToken: undefined,
      },
      status: 200,
    });
    mocks.driveObjectToDustType.mockResolvedValue(driveFile);
    mocks.getFileParentsMemoized.mockResolvedValue([
      folderId,
      parentId,
      rootId,
    ]);

    const result = await incrementalSync(
      connector.id,
      "drive-1",
      false,
      Date.now(),
      "page-token"
    );

    const folder = await GoogleDriveFilesModel.findOne({
      where: {
        connectorId: connector.id,
        driveFileId: folderId,
      },
    });

    expect(result).toEqual({
      hadRelevantChange: true,
      newFolders: [folderId],
      nextPageToken: undefined,
    });
    expect(folder).toBeNull();
    expect(mocks.upsertDataSourceFolder).not.toHaveBeenCalled();
  });

  it("records a relevant sync when a selected file is synced", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const driveFile = makeGoogleDriveFile({
      id: `file-${suffix}`,
      name: "Planning Notes",
      parent: `parent-${suffix}`,
    });
    const beforeSyncMs = Date.now();

    mocks.changeList.mockResolvedValue({
      data: {
        changes: [makeFolderChange(driveFile)],
        newStartPageToken: "sync-token",
        nextPageToken: undefined,
      },
      status: 200,
    });
    mocks.driveObjectToDustType.mockResolvedValue(driveFile);

    const result = await incrementalSync(
      connector.id,
      "drive-1",
      false,
      Date.now(),
      "page-token"
    );

    const syncToken = await GoogleDriveSyncTokenModel.findOne({
      where: {
        connectorId: connector.id,
        driveId: "drive-1",
      },
    });

    expect(result?.hadRelevantChange).toBe(true);
    expect(syncToken?.syncToken).toBe("sync-token");
    expect(syncToken?.lastSyncAt?.getTime()).toBeGreaterThanOrEqual(
      beforeSyncMs
    );
    expect(
      syncToken?.lastRelevantChangeAt?.getTime()
    ).toBeGreaterThanOrEqual(beforeSyncMs);
  });

  it("carries removed-file relevance across an activity retry", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const deletedFileId = `deleted-file-${suffix}`;
    const skippedFile = makeGoogleDriveFile({
      id: `skipped-file-${suffix}`,
      name: "Skipped File",
      parent: `parent-${suffix}`,
    });
    const startSyncTs = Date.now();
    const beforeSyncMs = Date.now();

    mockRedisStore();
    await GoogleDriveFilesModel.create({
      connectorId: connector.id,
      driveFileId: deletedFileId,
      dustFileId: `gdrive-${deletedFileId}`,
      mimeType: "application/pdf",
      name: "Deleted File",
      parentId: `parent-${suffix}`,
    });

    mocks.changeList.mockResolvedValue({
      data: {
        changes: [
          makeRemovedFileChange(deletedFileId),
          makeFolderChange(skippedFile),
        ],
        newStartPageToken: "sync-token",
        nextPageToken: undefined,
      },
      status: 200,
    });
    mocks.deleteFile.mockImplementation(async (file: GoogleDriveFilesModel) => {
      await file.destroy();
    });
    mocks.driveObjectToDustType.mockResolvedValue(skippedFile);
    mocks.syncOneFile
      .mockRejectedValueOnce(new Error("later change failed"))
      .mockResolvedValueOnce(false);

    await expect(
      incrementalSync(connector.id, "drive-1", false, startSyncTs, "page-token")
    ).rejects.toThrow("later change failed");

    const result = await incrementalSync(
      connector.id,
      "drive-1",
      false,
      startSyncTs,
      "page-token"
    );

    const syncToken = await GoogleDriveSyncTokenModel.findOne({
      where: {
        connectorId: connector.id,
        driveId: "drive-1",
      },
    });

    expect(result?.hadRelevantChange).toBe(true);
    expect(syncToken?.lastRelevantChangeAt?.getTime()).toBeGreaterThanOrEqual(
      beforeSyncMs
    );
  });

  it("carries out-of-scope deletion relevance when the ignored marker is retried", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const outOfScopeFile = makeGoogleDriveFile({
      id: `out-of-scope-file-${suffix}`,
      name: "Out of Scope File",
      parent: `parent-${suffix}`,
    });
    const invalidChange = {
      changeType: "file" as const,
      file: {
        id: `invalid-file-${suffix}`,
        mimeType: "application/vnd.google-apps.document",
      },
    };
    const startSyncTs = Date.now();
    const beforeSyncMs = Date.now();

    mockRedisStore();
    await GoogleDriveFilesModel.create({
      connectorId: connector.id,
      driveFileId: outOfScopeFile.id,
      dustFileId: `gdrive-${outOfScopeFile.id}`,
      mimeType: "application/pdf",
      name: outOfScopeFile.name,
      parentId: outOfScopeFile.parent,
    });

    mocks.changeList
      .mockResolvedValueOnce({
        data: {
          changes: [makeFolderChange(outOfScopeFile), invalidChange],
          newStartPageToken: "sync-token",
          nextPageToken: undefined,
        },
        status: 200,
      })
      .mockResolvedValueOnce({
        data: {
          changes: [makeFolderChange(outOfScopeFile)],
          newStartPageToken: "sync-token",
          nextPageToken: undefined,
        },
        status: 200,
      });
    mocks.deleteOneFile.mockImplementation(
      async (connectorId: number, file: GoogleDriveObjectType) => {
        await GoogleDriveFilesModel.destroy({
          where: { connectorId, driveFileId: file.id },
        });
      }
    );
    mocks.driveObjectToDustType.mockResolvedValue(outOfScopeFile);
    mocks.objectIsInFolderSelection
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(
      incrementalSync(connector.id, "drive-1", false, startSyncTs, "page-token")
    ).rejects.toThrow("Invalid file");

    const result = await incrementalSync(
      connector.id,
      "drive-1",
      false,
      startSyncTs,
      "page-token"
    );

    const syncToken = await GoogleDriveSyncTokenModel.findOne({
      where: {
        connectorId: connector.id,
        driveId: "drive-1",
      },
    });

    expect(result?.hadRelevantChange).toBe(true);
    expect(syncToken?.lastRelevantChangeAt?.getTime()).toBeGreaterThanOrEqual(
      beforeSyncMs
    );
  });

  it("records only lastSyncAt when a completed sync has no relevant changes", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const previousLastSyncAt = new Date("2025-01-02T00:00:00.000Z");
    const previousLastRelevantChangeAt = new Date("2025-01-01T00:00:00.000Z");

    await GoogleDriveSyncTokenModel.create({
      connectorId: connector.id,
      driveId: "drive-1",
      syncToken: "previous-sync-token",
      lastSyncAt: previousLastSyncAt,
      lastRelevantChangeAt: previousLastRelevantChangeAt,
    });

    mocks.changeList.mockResolvedValue({
      data: {
        changes: [],
        newStartPageToken: "sync-token",
        nextPageToken: undefined,
      },
      status: 200,
    });

    await incrementalSync(
      connector.id,
      "drive-1",
      false,
      Date.now(),
      "page-token"
    );

    const syncToken = await GoogleDriveSyncTokenModel.findOne({
      where: {
        connectorId: connector.id,
        driveId: "drive-1",
      },
    });

    expect(syncToken?.syncToken).toBe("sync-token");
    expect(syncToken?.lastSyncAt?.getTime()).toBeGreaterThan(
      previousLastSyncAt.getTime()
    );
    expect(syncToken?.lastRelevantChangeAt?.toISOString()).toBe(
      previousLastRelevantChangeAt.toISOString()
    );
  });

  it("seeds the relevant-change baseline when a completed sync has no prior relevant change", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const createdAt = new Date("2025-01-01T00:00:00.000Z");
    const previousLastSyncAt = new Date("2025-01-02T00:00:00.000Z");

    await GoogleDriveSyncTokenModel.create({
      connectorId: connector.id,
      createdAt,
      driveId: "drive-1",
      syncToken: "previous-sync-token",
      lastSyncAt: previousLastSyncAt,
      lastRelevantChangeAt: null,
    });

    mocks.changeList.mockResolvedValue({
      data: {
        changes: [],
        newStartPageToken: "sync-token",
        nextPageToken: undefined,
      },
      status: 200,
    });

    const result = await incrementalSync(
      connector.id,
      "drive-1",
      false,
      Date.now(),
      "page-token"
    );

    const syncToken = await GoogleDriveSyncTokenModel.findOne({
      where: {
        connectorId: connector.id,
        driveId: "drive-1",
      },
    });

    expect(result?.hadRelevantChange).toBe(false);
    expect(syncToken?.syncToken).toBe("sync-token");
    expect(syncToken?.lastSyncAt?.getTime()).toBeGreaterThan(
      previousLastSyncAt.getTime()
    );
    expect(syncToken?.lastRelevantChangeAt?.toISOString()).toBe(
      createdAt.toISOString()
    );
  });

  it("does not record a relevant change when syncOneFile skips a selected file", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const previousLastRelevantChangeAt = new Date("2025-01-01T00:00:00.000Z");
    const driveFile = makeGoogleDriveFile({
      id: `file-${suffix}`,
      name: "Planning Notes",
      parent: `parent-${suffix}`,
    });

    await GoogleDriveSyncTokenModel.create({
      connectorId: connector.id,
      driveId: "drive-1",
      syncToken: "previous-sync-token",
      lastSyncAt: new Date("2025-01-02T00:00:00.000Z"),
      lastRelevantChangeAt: previousLastRelevantChangeAt,
    });

    mocks.changeList.mockResolvedValue({
      data: {
        changes: [makeFolderChange(driveFile)],
        newStartPageToken: "sync-token",
        nextPageToken: undefined,
      },
      status: 200,
    });
    mocks.driveObjectToDustType.mockResolvedValue(driveFile);
    mocks.syncOneFile.mockResolvedValueOnce(false);

    const result = await incrementalSync(
      connector.id,
      "drive-1",
      false,
      Date.now(),
      "page-token"
    );

    const syncToken = await GoogleDriveSyncTokenModel.findOne({
      where: {
        connectorId: connector.id,
        driveId: "drive-1",
      },
    });

    expect(result?.hadRelevantChange).toBe(false);
    expect(mocks.syncOneFile).toHaveBeenCalledWith(
      connector.id,
      expect.any(Object),
      expect.any(Object),
      driveFile,
      expect.any(Number),
      { skipRecentlySeen: false }
    );
    expect(syncToken?.lastRelevantChangeAt?.toISOString()).toBe(
      previousLastRelevantChangeAt.toISOString()
    );
  });

  it("records relevant changes carried from an earlier page", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const previousLastRelevantChangeAt = new Date("2025-01-01T00:00:00.000Z");
    const beforeSyncMs = Date.now();

    await GoogleDriveSyncTokenModel.create({
      connectorId: connector.id,
      driveId: "drive-1",
      syncToken: "previous-sync-token",
      lastSyncAt: new Date("2025-01-02T00:00:00.000Z"),
      lastRelevantChangeAt: previousLastRelevantChangeAt,
    });

    mocks.changeList.mockResolvedValue({
      data: {
        changes: [],
        newStartPageToken: "sync-token",
        nextPageToken: undefined,
      },
      status: 200,
    });

    const result = await incrementalSync(
      connector.id,
      "drive-1",
      false,
      Date.now(),
      "page-token",
      true
    );

    const syncToken = await GoogleDriveSyncTokenModel.findOne({
      where: {
        connectorId: connector.id,
        driveId: "drive-1",
      },
    });

    expect(result?.hadRelevantChange).toBe(true);
    expect(syncToken?.lastRelevantChangeAt?.getTime()).toBeGreaterThanOrEqual(
      beforeSyncMs
    );
  });

  it("keeps sync cadence state unchanged when the sync throws", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const previousLastSyncAt = new Date("2025-01-02T00:00:00.000Z");
    const previousLastRelevantChangeAt = new Date("2025-01-01T00:00:00.000Z");

    await GoogleDriveSyncTokenModel.create({
      connectorId: connector.id,
      driveId: "drive-1",
      syncToken: "previous-sync-token",
      lastSyncAt: previousLastSyncAt,
      lastRelevantChangeAt: previousLastRelevantChangeAt,
    });

    mocks.changeList.mockRejectedValue(new Error("transient failure"));

    await expect(
      incrementalSync(connector.id, "drive-1", false, Date.now(), "page-token")
    ).rejects.toThrow("transient failure");

    const syncToken = await GoogleDriveSyncTokenModel.findOne({
      where: {
        connectorId: connector.id,
        driveId: "drive-1",
      },
    });

    expect(syncToken?.lastSyncAt?.toISOString()).toBe(
      previousLastSyncAt.toISOString()
    );
    expect(syncToken?.lastRelevantChangeAt?.toISOString()).toBe(
      previousLastRelevantChangeAt.toISOString()
    );
  });

  it("creates cadence state for a completed permanent drive skip", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const beforeSyncMs = Date.now();

    mocks.changeList.mockRejectedValue(new Error("shared drive not found"));
    mocks.getSyncPageToken.mockResolvedValue("initial-token");
    mocks.isSharedDriveNotFoundError.mockReturnValue(true);

    const result = await incrementalSync(
      connector.id,
      "drive-1",
      false,
      Date.now(),
      undefined
    );

    const syncToken = await GoogleDriveSyncTokenModel.findOne({
      where: {
        connectorId: connector.id,
        driveId: "drive-1",
      },
    });

    expect(result).toBeUndefined();
    expect(syncToken?.syncToken).toBe("initial-token");
    expect(syncToken?.lastSyncAt?.getTime()).toBeGreaterThanOrEqual(
      beforeSyncMs
    );
    expect(
      syncToken?.lastRelevantChangeAt?.getTime()
    ).toBeGreaterThanOrEqual(beforeSyncMs);
  });

  it("skips a permanent drive error when no sync token can be fetched", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);

    mocks.getSyncPageToken.mockRejectedValue(
      makeGoogleDriveError(403, "teamDriveMembershipRequired")
    );

    const result = await incrementalSync(
      connector.id,
      "drive-1",
      false,
      Date.now(),
      undefined
    );

    const syncToken = await GoogleDriveSyncTokenModel.findOne({
      where: {
        connectorId: connector.id,
        driveId: "drive-1",
      },
    });

    expect(result).toBeUndefined();
    expect(syncToken?.syncToken).toBe("__dust_inaccessible_drive__");
    expect(syncToken?.lastSyncAt).toBeInstanceOf(Date);
    expect(syncToken?.lastRelevantChangeAt).toBeInstanceOf(Date);
  });

  it("keeps sync cadence state unchanged when Google returns a transient 403", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const previousLastSyncAt = new Date("2025-01-02T00:00:00.000Z");
    const previousLastRelevantChangeAt = new Date("2025-01-01T00:00:00.000Z");

    await GoogleDriveSyncTokenModel.create({
      connectorId: connector.id,
      driveId: "drive-1",
      syncToken: "previous-sync-token",
      lastSyncAt: previousLastSyncAt,
      lastRelevantChangeAt: previousLastRelevantChangeAt,
    });

    mocks.changeList.mockRejectedValue(
      makeGoogleDriveError(403, "rateLimitExceeded")
    );

    await expect(
      incrementalSync(connector.id, "drive-1", false, Date.now(), "page-token")
    ).rejects.toThrow("Google Drive error");

    const syncToken = await GoogleDriveSyncTokenModel.findOne({
      where: {
        connectorId: connector.id,
        driveId: "drive-1",
      },
    });

    expect(syncToken?.lastSyncAt?.toISOString()).toBe(
      previousLastSyncAt.toISOString()
    );
    expect(syncToken?.lastRelevantChangeAt?.toISOString()).toBe(
      previousLastRelevantChangeAt.toISOString()
    );
  });

  it("keeps relevant changes carried from earlier pages on a permanent drive skip", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const previousLastRelevantChangeAt = new Date("2025-01-01T00:00:00.000Z");
    const beforeSyncMs = Date.now();

    await GoogleDriveSyncTokenModel.create({
      connectorId: connector.id,
      driveId: "drive-1",
      syncToken: "previous-sync-token",
      lastSyncAt: new Date("2025-01-02T00:00:00.000Z"),
      lastRelevantChangeAt: previousLastRelevantChangeAt,
    });

    mocks.changeList.mockRejectedValue(new Error("shared drive not found"));
    mocks.isSharedDriveNotFoundError.mockReturnValue(true);

    const result = await incrementalSync(
      connector.id,
      "drive-1",
      false,
      Date.now(),
      "page-token",
      true
    );

    const syncToken = await GoogleDriveSyncTokenModel.findOne({
      where: {
        connectorId: connector.id,
        driveId: "drive-1",
      },
    });

    expect(result).toBeUndefined();
    expect(syncToken?.lastRelevantChangeAt?.getTime()).toBeGreaterThanOrEqual(
      beforeSyncMs
    );
  });
});
