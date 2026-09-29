import { fetchTables } from "@connectors/connectors/bigquery/lib/bigquery_api";
import type { BigQueryCredentialsWithLocation } from "@connectors/types";
import { BigQuery } from "@google-cloud/bigquery";
import { afterEach, describe, expect, it, vi } from "vitest";

const credentials: BigQueryCredentialsWithLocation = {
  type: "service_account",
  project_id: "project",
  private_key_id: "key-id",
  private_key: "key",
  client_email: "service@example.com",
  client_id: "client-id",
  auth_uri: "https://example.com/auth",
  token_uri: "https://example.com/token",
  auth_provider_x509_cert_url: "https://example.com/cert",
  client_x509_cert_url: "https://example.com/client-cert",
  universe_domain: "googleapis.com",
  location: "US",
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("fetchTables", () => {
  it("paces table metadata requests across a page", async () => {
    vi.useFakeTimers();

    const connection = new BigQuery({ projectId: "project" });
    const dataset = connection.dataset("dataset");
    vi.spyOn(connection, "dataset").mockReturnValue(dataset);

    const tables = Array.from({ length: 21 }, (_, index) =>
      dataset.table(`table_${index}`)
    );
    Object.defineProperty(dataset, "getTables", {
      value: vi.fn(async () => [tables]),
    });
    const getMetadata = vi.fn(async () => [{ description: "A table" }]);
    for (const table of tables) {
      vi.spyOn(table, "getMetadata").mockImplementation(getMetadata);
    }

    const result = fetchTables({
      credentials,
      dataset: { name: "dataset", database_name: "project" },
      fetchTablesDescription: true,
      connection,
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(getMetadata).toHaveBeenCalledTimes(20);

    await vi.advanceTimersByTimeAsync(1000);
    const fetchedTables = await result;
    expect(fetchedTables.isOk()).toBe(true);
    if (fetchedTables.isOk()) {
      expect(fetchedTables.value).toHaveLength(21);
      expect(fetchedTables.value[0]?.description).toBe("A table");
    }
    expect(getMetadata).toHaveBeenCalledTimes(21);
  });
});
