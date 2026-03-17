import { randomUUID } from "node:crypto";

import { GoogleDriveFilesModel } from "@connectors/lib/models/google_drive";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { GoogleDriveObjectType } from "@connectors/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changeList: vi.fn(),
  deleteOneFile: vi.fn(),
  driveObjectToDustType: vi.fn(),
  getAuthObject: vi.fn(),
  getCachedLabels: vi.fn(),
  getDriveClient: vi.fn(),
  getFileParentsMemoized: vi.fn(),
  getFoldersToSync: vi.fn(),
  getSyncPageToken: vi.fn(),
  heartbeat: vi.fn(),
  objectIsInFolderSelection: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  syncOneFile: vi.fn(),
  updateDataSourceDocumentParents: vi.fn(),
  updateDataSourceTableParents: vi.fn(),
  upsertDataSourceFolder: vi.fn(),
}));

vi.mock("@connectors/connectors/google_drive", () => ({
  getSourceUrlForGoogleDriveFiles: (
    file: { driveFileId?: string; id?: string }
  ) =>
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
    deleteOneFile: mocks.deleteOneFile,
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

vi.mock(
  "@connectors/connectors/google_drive/temporal/spreadsheets",
  () => ({
    deleteSpreadsheet: vi.fn(),
  })
);

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
      isSharedDriveNotFoundError: vi.fn(() => false),
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

describe("google drive incremental sync folder metadata", () => {
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
    mocks.getFileParentsMemoized.mockResolvedValue([folderId, parentId, rootId]);

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

    expect(result).toEqual({ newFolders: [], nextPageToken: undefined });
    expect(folder?.name).toBe("Board Presentations");
    expect(folder?.parentId).toBe(parentId);
    expect(folder?.lastSeenTs?.getTime()).toBeGreaterThan(
      previousLastSeenTs.getTime()
    );
    expect(mocks.upsertDataSourceFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: `gdrive-${folderId}`,
        parentId: `gdrive-${parentId}`,
        parents: [`gdrive-${folderId}`, `gdrive-${parentId}`, `gdrive-${rootId}`],
        title: "Board Presentations",
      })
    );
  });

  it("keeps the renamed folder title when a move triggers parent recursion", async () => {
    const suffix = randomUUID();
    const folderId = `folder-${suffix}`;
    const oldParentId = `old-parent-${suffix}`;
    const newParentId = `new-parent-${suffix}`;
    const rootId = `root-${suffix}`;
    const childId = `child-${suffix}`;
    const connector = await makeConnector(suffix);
    const previousLastSeenTs = new Date("2025-01-01T00:00:00.000Z");

    await GoogleDriveFilesModel.create({
      connectorId: connector.id,
      driveFileId: folderId,
      dustFileId: `gdrive-${folderId}`,
      lastSeenTs: previousLastSeenTs,
      mimeType: "application/vnd.google-apps.folder",
      name: "Board Prez",
      parentId: oldParentId,
    });
    await GoogleDriveFilesModel.create({
      connectorId: connector.id,
      driveFileId: childId,
      dustFileId: `gdrive-${childId}`,
      mimeType: "text/plain",
      name: "notes.txt",
      parentId: folderId,
    });

    const driveFile = makeGoogleDriveFolder({
      id: folderId,
      name: "Board Presentations",
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
    expect(folder?.parentId).toBe(newParentId);
    expect(folder?.lastSeenTs?.getTime()).toBeGreaterThan(
      previousLastSeenTs.getTime()
    );
    expect(mocks.upsertDataSourceFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: `gdrive-${folderId}`,
        parentId: `gdrive-${newParentId}`,
        parents: [`gdrive-${folderId}`, `gdrive-${newParentId}`, `gdrive-${rootId}`],
        title: "Board Presentations",
      })
    );
    expect(mocks.updateDataSourceDocumentParents).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: `gdrive-${childId}`,
        parentId: `gdrive-${folderId}`,
        parents: [
          `gdrive-${childId}`,
          `gdrive-${folderId}`,
          `gdrive-${newParentId}`,
          `gdrive-${rootId}`,
        ],
      })
    );
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
    mocks.getFileParentsMemoized.mockResolvedValue([folderId, parentId, rootId]);

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
      newFolders: [folderId],
      nextPageToken: undefined,
    });
    expect(folder).toBeNull();
    expect(mocks.upsertDataSourceFolder).not.toHaveBeenCalled();
  });
});
