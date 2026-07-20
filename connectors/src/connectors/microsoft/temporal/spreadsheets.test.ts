import { randomUUID } from "node:crypto";

import { MicrosoftThrottlingError } from "@connectors/connectors/microsoft/lib/errors";
import {
  getDriveItemInternalId,
  getWorksheetInternalId,
} from "@connectors/connectors/microsoft/lib/graph_api";
import type { DriveItem } from "@connectors/connectors/microsoft/lib/types";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { MicrosoftNodeResource } from "@connectors/resources/microsoft_resource";
import type { Client } from "@microsoft/microsoft-graph-client";
import { GraphError } from "@microsoft/microsoft-graph-client";
import type { WorkbookWorksheet } from "@microsoft/microsoft-graph-types";
import { stringify } from "csv-stringify/sync";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteDataSourceTable: vi.fn(),
  getColumnsFromListItem: vi.fn(),
  getMicrosoftClient: vi.fn(),
  getParents: vi.fn(),
  getWorksheetRangeText: vi.fn(),
  getWorksheets: vi.fn(),
  getWorksheetUsedRangeMetadata: vi.fn(),
  heartbeat: vi.fn(async () => {}),
  upsertDataSourceFolder: vi.fn(),
  upsertDataSourceTableFromCsv: vi.fn(),
}));

vi.mock("@connectors/connectors/microsoft", () => ({
  getMicrosoftClient: mocks.getMicrosoftClient,
}));

vi.mock(
  "@connectors/connectors/microsoft/lib/graph_api",
  async (importOriginal) => {
    const mod =
      await importOriginal<
        typeof import("@connectors/connectors/microsoft/lib/graph_api")
      >();

    return {
      ...mod,
      getWorksheetRangeText: mocks.getWorksheetRangeText,
      getWorksheets: mocks.getWorksheets,
      getWorksheetUsedRangeMetadata: mocks.getWorksheetUsedRangeMetadata,
    };
  }
);

vi.mock(
  "@connectors/connectors/microsoft/lib/utils",
  async (importOriginal) => {
    const mod =
      await importOriginal<
        typeof import("@connectors/connectors/microsoft/lib/utils")
      >();

    return {
      ...mod,
      getColumnsFromListItem: mocks.getColumnsFromListItem,
    };
  }
);

vi.mock("@connectors/connectors/microsoft/temporal/file", () => ({
  getParents: mocks.getParents,
}));

vi.mock("@connectors/lib/data_sources", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@connectors/lib/data_sources")>();

  return {
    ...mod,
    deleteDataSourceTable: mocks.deleteDataSourceTable,
    upsertDataSourceFolder: mocks.upsertDataSourceFolder,
    upsertDataSourceTableFromCsv: mocks.upsertDataSourceTableFromCsv,
  };
});

import logger from "@connectors/logger/logger";

import {
  columnIndexToLetter,
  computeRangeChunkAddresses,
  handleSpreadSheet,
  processSheet,
} from "./spreadsheets";

const fakeClient = {} as unknown as Client;

function makeDriveItem(suffix: string): DriveItem {
  return {
    "@microsoft.graph.downloadUrl": undefined,
    id: `item-${suffix}`,
    name: `spreadsheet-${suffix}.xlsx`,
    file: {
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    parentReference: { driveId: `drive-${suffix}` },
    webUrl: `https://example.com/${suffix}`,
    listItem: { fields: {} },
  };
}

async function makeConnector(suffix: string) {
  return ConnectorResource.makeNew(
    "microsoft",
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

function makeSheetFixtures(suffix: string) {
  const file = makeDriveItem(suffix);
  const worksheet: WorkbookWorksheet = {
    id: `worksheet-${suffix}`,
    name: "Sheet1",
  };
  const spreadsheetInternalId = getDriveItemInternalId(file);
  const worksheetInternalId = getWorksheetInternalId(
    worksheet,
    spreadsheetInternalId
  );

  return { file, worksheet, spreadsheetInternalId, worksheetInternalId };
}

async function runProcessSheet(
  connector: ConnectorResource,
  fixtures: ReturnType<typeof makeSheetFixtures>
) {
  return processSheet({
    client: fakeClient,
    connector,
    spreadsheet: fixtures.file,
    spreadsheetInternalId: fixtures.spreadsheetInternalId,
    worksheet: fixtures.worksheet,
    worksheetInternalId: fixtures.worksheetInternalId,
    localLogger: logger.child({}),
    startSyncTs: Date.now(),
    heartbeat: mocks.heartbeat,
  });
}

describe("columnIndexToLetter", () => {
  it("converts 0-based column indexes to A1 letters", () => {
    expect(columnIndexToLetter(0)).toBe("A");
    expect(columnIndexToLetter(25)).toBe("Z");
    expect(columnIndexToLetter(26)).toBe("AA");
    expect(columnIndexToLetter(51)).toBe("AZ");
    expect(columnIndexToLetter(52)).toBe("BA");
    expect(columnIndexToLetter(701)).toBe("ZZ");
    expect(columnIndexToLetter(702)).toBe("AAA");
    // Last column supported by Excel.
    expect(columnIndexToLetter(16383)).toBe("XFD");
  });
});

describe("computeRangeChunkAddresses", () => {
  it("chunks an A1-origin range by the rows-per-chunk ceiling", () => {
    expect(
      computeRangeChunkAddresses({
        rowIndex: 0,
        columnIndex: 0,
        rowCount: 10000,
        columnCount: 10,
      })
    ).toEqual(["A1:J5000", "A5001:J10000"]);
  });

  it("offsets addresses when the used range does not start at A1", () => {
    expect(
      computeRangeChunkAddresses({
        rowIndex: 2,
        columnIndex: 1,
        rowCount: 7000,
        columnCount: 40,
      })
    ).toEqual(["B3:AO2502", "B2503:AO5002", "B5003:AO7002"]);
  });

  it("shrinks chunk row count to respect the per-request cell budget", () => {
    // floor(100_000 / 16_384) = 6 rows per chunk.
    expect(
      computeRangeChunkAddresses({
        rowIndex: 0,
        columnIndex: 0,
        rowCount: 10,
        columnCount: 16384,
      })
    ).toEqual(["A1:XFD6", "A7:XFD10"]);
  });

  it("does not emit an empty trailing chunk on exact multiples", () => {
    expect(
      computeRangeChunkAddresses({
        rowIndex: 0,
        columnIndex: 0,
        rowCount: 12000,
        columnCount: 2,
      })
    ).toEqual(["A1:B5000", "A5001:B10000", "A10001:B12000"]);
  });
});

describe("processSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.deleteDataSourceTable.mockResolvedValue(undefined);
    mocks.getColumnsFromListItem.mockResolvedValue([]);
    mocks.getMicrosoftClient.mockResolvedValue(fakeClient);
    mocks.getParents.mockImplementation(
      async ({ internalId }: { internalId: string }) => [internalId, "root"]
    );
    mocks.upsertDataSourceFolder.mockResolvedValue(undefined);
    mocks.upsertDataSourceTableFromCsv.mockResolvedValue(undefined);
  });

  it("skips sheets with too many rows at probe time, without fetching values", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const fixtures = makeSheetFixtures(suffix);

    mocks.getWorksheetUsedRangeMetadata.mockResolvedValue({
      address: "Sheet1!A1:J60000",
      cellCount: 600000,
      columnCount: 10,
      columnIndex: 0,
      rowCount: 60000,
      rowIndex: 0,
    });

    const result = await runProcessSheet(connector, fixtures);

    expect(result.isOk()).toBe(true);
    expect(mocks.getWorksheetRangeText).not.toHaveBeenCalled();
    expect(mocks.upsertDataSourceTableFromCsv).not.toHaveBeenCalled();
    expect(mocks.deleteDataSourceTable).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: fixtures.worksheetInternalId })
    );

    const node = await MicrosoftNodeResource.fetchByInternalId(
      connector.id,
      fixtures.worksheetInternalId
    );
    expect(node?.skipReason).toBe("too_many_rows");
  });

  it("skips sheets with too many cells at probe time, without fetching values", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const fixtures = makeSheetFixtures(suffix);

    // 2000 x 2000 = 4M cells: passes the row cap, fails the cell cap.
    mocks.getWorksheetUsedRangeMetadata.mockResolvedValue({
      address: "Sheet1!A1:BXX2000",
      cellCount: 4000000,
      columnCount: 2000,
      columnIndex: 0,
      rowCount: 2000,
      rowIndex: 0,
    });

    const result = await runProcessSheet(connector, fixtures);

    expect(result.isOk()).toBe(true);
    expect(mocks.getWorksheetRangeText).not.toHaveBeenCalled();
    expect(mocks.upsertDataSourceTableFromCsv).not.toHaveBeenCalled();

    const node = await MicrosoftNodeResource.fetchByInternalId(
      connector.id,
      fixtures.worksheetInternalId
    );
    expect(node?.skipReason).toBe("too_many_cells");
  });

  it("fetches values in sequential bounded chunks and upserts the assembled CSV", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const fixtures = makeSheetFixtures(suffix);

    mocks.getWorksheetUsedRangeMetadata.mockResolvedValue({
      address: "Sheet1!B3:AO7002",
      cellCount: 280000,
      columnCount: 40,
      columnIndex: 1,
      rowCount: 7000,
      rowIndex: 2,
    });

    const chunk1 = [
      ["header1", "header2"],
      ["a1", "a2"],
    ];
    const chunk2 = [["b1", "b2"]];
    const chunk3 = [["c1", "c2"]];
    mocks.getWorksheetRangeText
      .mockResolvedValueOnce({ text: chunk1 })
      .mockResolvedValueOnce({ text: chunk2 })
      .mockResolvedValueOnce({ text: chunk3 });

    const result = await runProcessSheet(connector, fixtures);

    expect(result.isOk()).toBe(true);
    expect(
      mocks.getWorksheetRangeText.mock.calls.map((call) => call[3])
    ).toEqual(["B3:AO2502", "B2503:AO5002", "B5003:AO7002"]);
    expect(mocks.heartbeat).toHaveBeenCalledTimes(3);

    // The assembled CSV is byte-identical to a single-shot stringify of all rows.
    expect(mocks.upsertDataSourceTableFromCsv).toHaveBeenCalledTimes(1);
    expect(mocks.upsertDataSourceTableFromCsv).toHaveBeenCalledWith(
      expect.objectContaining({
        tableCsv: stringify([...chunk1, ...chunk2, ...chunk3]),
        tableId: fixtures.worksheetInternalId,
        truncate: true,
      })
    );

    const node = await MicrosoftNodeResource.fetchByInternalId(
      connector.id,
      fixtures.worksheetInternalId
    );
    expect(node?.nodeType).toBe("worksheet");
    expect(node?.skipReason).toBeNull();
  });

  it("aborts accumulation and skips the sheet when the CSV byte cap is exceeded", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const fixtures = makeSheetFixtures(suffix);

    // 3 chunks of 5000 rows each (10001 rows, 20 columns).
    mocks.getWorksheetUsedRangeMetadata.mockResolvedValue({
      address: "Sheet1!A1:T10001",
      cellCount: 200020,
      columnCount: 20,
      columnIndex: 0,
      rowCount: 10001,
      rowIndex: 0,
    });

    // Two 30MB cells cross the 50MB cap on the second chunk.
    const bigCell = "x".repeat(30 * 1024 * 1024);
    mocks.getWorksheetRangeText
      .mockResolvedValueOnce({ text: [[bigCell]] })
      .mockResolvedValueOnce({ text: [[bigCell]] });

    const result = await runProcessSheet(connector, fixtures);

    expect(result.isOk()).toBe(true);
    expect(mocks.getWorksheetRangeText).toHaveBeenCalledTimes(2);
    expect(mocks.upsertDataSourceTableFromCsv).not.toHaveBeenCalled();

    const node = await MicrosoftNodeResource.fetchByInternalId(
      connector.id,
      fixtures.worksheetInternalId
    );
    expect(node?.skipReason).toBe("csv_too_large");
  });

  it("returns an error for empty sheets without fetching values", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const fixtures = makeSheetFixtures(suffix);

    // An empty worksheet probes as a single A1 cell.
    mocks.getWorksheetUsedRangeMetadata.mockResolvedValue({
      address: "Sheet1!A1",
      cellCount: 1,
      columnCount: 1,
      columnIndex: 0,
      rowCount: 1,
      rowIndex: 0,
    });

    const result = await runProcessSheet(connector, fixtures);

    expect(result.isErr()).toBe(true);
    expect(mocks.getWorksheetRangeText).not.toHaveBeenCalled();
  });

  it("marks the worksheet as skipped on a 504 during the probe", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const fixtures = makeSheetFixtures(suffix);

    mocks.getWorksheetUsedRangeMetadata.mockRejectedValue(
      new GraphError(504, "Gateway Timeout")
    );

    const result = await runProcessSheet(connector, fixtures);

    expect(result.isOk()).toBe(true);

    const node = await MicrosoftNodeResource.fetchByInternalId(
      connector.id,
      fixtures.worksheetInternalId
    );
    expect(node?.skipReason).toBe("error_fetching_content");
  });

  it("marks the worksheet as skipped on a 504 during a chunk read", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const fixtures = makeSheetFixtures(suffix);

    mocks.getWorksheetUsedRangeMetadata.mockResolvedValue({
      address: "Sheet1!B3:AO7002",
      cellCount: 280000,
      columnCount: 40,
      columnIndex: 1,
      rowCount: 7000,
      rowIndex: 2,
    });

    mocks.getWorksheetRangeText
      .mockResolvedValueOnce({ text: [["header"], ["a"]] })
      .mockRejectedValueOnce(new GraphError(504, "Gateway Timeout"));

    const result = await runProcessSheet(connector, fixtures);

    expect(result.isOk()).toBe(true);
    expect(mocks.getWorksheetRangeText).toHaveBeenCalledTimes(2);
    expect(mocks.upsertDataSourceTableFromCsv).not.toHaveBeenCalled();

    const node = await MicrosoftNodeResource.fetchByInternalId(
      connector.id,
      fixtures.worksheetInternalId
    );
    expect(node?.skipReason).toBe("error_fetching_content");
  });

  it("rethrows throttling errors so the activity interceptor can honor Retry-After", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const fixtures = makeSheetFixtures(suffix);

    mocks.getWorksheetUsedRangeMetadata.mockRejectedValue(
      new MicrosoftThrottlingError("/endpoint", 1000)
    );

    await expect(runProcessSheet(connector, fixtures)).rejects.toBeInstanceOf(
      MicrosoftThrottlingError
    );
  });
});

describe("handleSpreadSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getColumnsFromListItem.mockResolvedValue([]);
    mocks.getMicrosoftClient.mockResolvedValue(fakeClient);
    mocks.getParents.mockImplementation(
      async ({ internalId }: { internalId: string }) => [internalId, "root"]
    );
    mocks.upsertDataSourceFolder.mockResolvedValue(undefined);
  });

  it("honors a persisted skip reason without re-fetching or deleting the worksheet", async () => {
    const suffix = randomUUID();
    const connector = await makeConnector(suffix);
    const fixtures = makeSheetFixtures(suffix);

    await MicrosoftNodeResource.makeNew({
      connectorId: connector.id,
      internalId: fixtures.worksheetInternalId,
      mimeType: "text/csv",
      name: "Sheet1",
      nodeType: "worksheet",
      parentInternalId: fixtures.spreadsheetInternalId,
      skipReason: "too_many_cells",
      webUrl: null,
    });

    mocks.getWorksheets.mockResolvedValue({ results: [fixtures.worksheet] });

    const result = await handleSpreadSheet({
      connectorId: connector.id,
      file: fixtures.file,
      parentInternalId: `parent-${suffix}`,
      localLogger: logger.child({}),
      startSyncTs: Date.now(),
      heartbeat: mocks.heartbeat,
    });

    expect(result.isOk()).toBe(true);
    expect(mocks.getWorksheetUsedRangeMetadata).not.toHaveBeenCalled();
    expect(mocks.getWorksheetRangeText).not.toHaveBeenCalled();

    // The skip row survived the stale-sheet deletion pass.
    const node = await MicrosoftNodeResource.fetchByInternalId(
      connector.id,
      fixtures.worksheetInternalId
    );
    expect(node?.skipReason).toBe("too_many_cells");
  });
});
