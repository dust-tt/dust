import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { BigQuery } from "@google-cloud/bigquery";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@google-cloud/bigquery");

const MOCK_CREDENTIALS = {
  type: "service_account",
  project_id: "test-project",
  private_key_id: "test-key-id",
  private_key: "test-private-key",
  client_email: "test@test-project.iam.gserviceaccount.com",
  client_id: "test-client-id",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url:
    "https://www.googleapis.com/robot/v1/metadata/x509/test",
  universe_domain: "googleapis.com",
};

function postCheck(wId: string, body: unknown) {
  return honoApp.request(`/api/w/${wId}/credentials/check_bigquery_locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockGetDatasets(impl: () => Promise<unknown>) {
  Object.defineProperty(BigQuery.prototype, "getDatasets", {
    value: vi.fn(impl),
    configurable: true,
    writable: true,
  });
}

function mockDatasets(datasets: unknown[]) {
  mockGetDatasets(async () => [datasets]);
}

function mockDatasetsError(message: string) {
  mockGetDatasets(async () => {
    throw new Error(message);
  });
}

describe("POST /api/w/:wId/credentials/check_bigquery_locations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 403 when caller is not an admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await postCheck(workspace.sId, {
      credentials: MOCK_CREDENTIALS,
    });

    expect(response.status).toBe(403);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("workspace_auth_error");
  });

  it("returns 400 when credentials are invalid", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await postCheck(workspace.sId, {
      credentials: { invalid: "credentials" },
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: { type: string } };
    expect(data.error.type).toBe("invalid_request_error");
  });

  it("returns locations grouped by dataset location with sorted tables", async () => {
    mockDatasets([
      {
        id: "dataset1",
        location: "uS",
        getTables: vi
          .fn()
          .mockResolvedValue([[{ id: "table2" }, { id: "table1" }]]),
      },
      {
        id: "dataset2",
        location: "EU",
        getTables: vi.fn().mockResolvedValue([[{ id: "table3" }]]),
      },
      {
        id: "dataset3",
        location: "EU-central1",
        getTables: vi.fn().mockResolvedValue([[{ id: "table4" }]]),
      },
      {
        id: "dataset4",
        location: "EU-central1",
        getTables: vi.fn().mockResolvedValue([[{ id: "table5" }]]),
      },
    ]);

    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await postCheck(workspace.sId, {
      credentials: MOCK_CREDENTIALS,
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      locations: Record<string, string[]>;
    };
    expect(data.locations).toEqual({
      us: ["dataset1.table1", "dataset1.table2"],
      eu: ["dataset2.table3"],
      "eu-central1": ["dataset3.table4", "dataset4.table5"],
    });
  });

  it("skips datasets that have no location", async () => {
    mockDatasets([
      {
        id: "dataset_no_loc",
        location: undefined,
        getTables: vi.fn().mockResolvedValue([[{ id: "skipped" }]]),
      },
      {
        id: "dataset_us",
        location: "US",
        getTables: vi.fn().mockResolvedValue([[{ id: "kept" }]]),
      },
    ]);

    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await postCheck(workspace.sId, {
      credentials: MOCK_CREDENTIALS,
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      locations: Record<string, string[]>;
    };
    expect(data.locations).toEqual({
      us: ["dataset_us.kept"],
    });
  });

  it("returns 400 with normalized message when BigQuery throws", async () => {
    mockDatasetsError("BigQuery boom");

    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await postCheck(workspace.sId, {
      credentials: MOCK_CREDENTIALS,
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as {
      error: { type: string; message: string };
    };
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toBe(
      "Failed to check BigQuery locations: BigQuery boom"
    );
  });
});

describe("Method support /api/w/:wId/credentials/check_bigquery_locations", () => {
  it("returns 404 for unsupported methods", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    for (const method of ["GET", "DELETE", "PUT", "PATCH"] as const) {
      const response = await honoApp.request(
        `/api/w/${workspace.sId}/credentials/check_bigquery_locations`,
        { method }
      );
      expect(response.status).toBe(404);
    }
  });
});
