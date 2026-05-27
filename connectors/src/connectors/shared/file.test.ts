import { TablesError } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertDataSourceTableFromCsv: vi.fn(),
}));

vi.mock("@connectors/lib/data_sources", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@connectors/lib/data_sources")>();

  return {
    ...mod,
    upsertDataSourceTableFromCsv: mocks.upsertDataSourceTableFromCsv,
  };
});

import { handleCsvFile } from "./file";

const dataSourceConfig: DataSourceConfig = {
  dataSourceId: "data-source-id",
  workspaceAPIKey: "workspace-api-key",
  workspaceId: "workspace-id",
};

const csvData = new Uint8Array([
  110, 97, 109, 101, 10, 80, 108, 97, 110, 110, 105, 110, 103,
]).buffer;

describe("handleCsvFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps invalid row table errors skippable by default", async () => {
    mocks.upsertDataSourceTableFromCsv.mockRejectedValueOnce(
      new TablesError("invalid_csv", "Invalid rows")
    );

    const result = await handleCsvFile({
      data: csvData,
      tableId: "table-id",
      fileName: "table.csv",
      maxDocumentLen: 1000,
      localLogger: logger,
      dataSourceConfig,
      provider: "google_drive",
      connectorId: 1,
      parents: ["table-id"],
      tags: [],
    });

    expect(result.isErr()).toBe(false);
  });

  it("returns invalid row table errors when requested", async () => {
    const tablesError = new TablesError("invalid_csv", "Invalid rows");
    mocks.upsertDataSourceTableFromCsv.mockRejectedValueOnce(tablesError);

    const result = await handleCsvFile({
      data: csvData,
      tableId: "table-id",
      fileName: "table.csv",
      maxDocumentLen: 1000,
      localLogger: logger,
      dataSourceConfig,
      provider: "google_drive",
      connectorId: 1,
      parents: ["table-id"],
      tags: [],
      failOnInvalidRows: true,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(tablesError);
    }
  });
});
