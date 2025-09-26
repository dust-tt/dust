import { BigQuery } from "@google-cloud/bigquery";
import { describe, expect, it, vi } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

import handler from "./check_bigquery_locations";

vi.mock("@google-cloud/bigquery");

// Mock the getSession function to return the user without going through the auth0 session
vi.mock(import("../../../../../lib/auth"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getSession: vi.fn().mockReturnValue({
      user: {
        sub: "test-user",
      },
    }),
  };
});

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

describe("POST /api/w/[wId]/credentials/check_bigquery_locations", () => {
  it("returns locations with tables when called with valid credentials", async () => {
    const mockDatasets = [
      {
        id: "dataset1",
        location: "uS",
        getTables: vi.fn().mockResolvedValue([
          [
            {
              id: "table1",
            },
            {
              id: "table2",
            },
          ],
        ]),
      },
      {
        id: "dataset2",
        location: "EU",
        getTables: vi.fn().mockResolvedValue([
          [
            {
              id: "table3",
            },
          ],
        ]),
      },
      {
        id: "dataset3",
        location: "EU-central1",
        getTables: vi.fn().mockResolvedValue([
          [
            {
              id: "table4",
            },
          ],
        ]),
      },
      {
        id: "dataset4",
        location: "EU-central1",
        getTables: vi.fn().mockResolvedValue([
          [
            {
              id: "table5",
            },
          ],
        ]),
      },
    ];

    vi.mocked(BigQuery).mockImplementation(
      () =>
        ({
          getDatasets: vi.fn().mockResolvedValue([mockDatasets]),
        }) as any
    );

    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      credentials: MOCK_CREDENTIALS,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      locations: {
        us: ["dataset1.table1", "dataset1.table2"],
        eu: ["dataset2.table3"],
        "eu-central1": ["dataset3.table4", "dataset4.table5"],
      },
    });
  });

  it("returns 400 when called with invalid credentials", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      credentials: {
        invalid: "credentials",
      },
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 when BigQuery client throws an error", async () => {
    vi.mocked(BigQuery).mockImplementation(
      () =>
        ({
          getDatasets: vi.fn().mockRejectedValue(new Error("BigQuery error")),
        }) as any
    );

    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      credentials: MOCK_CREDENTIALS,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchObject({
      error: {
        message: "Failed to check BigQuery locations: BigQuery error",
      },
    });
  });

  it("returns 405 when called with invalid method", async () => {
    const { req, res } = await createPrivateApiMockRequest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 403 when user is not workspace admin", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    req.body = {
      credentials: MOCK_CREDENTIALS,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toMatchObject({
      error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can check BigQuery locations.",
      },
    });
  });
});
