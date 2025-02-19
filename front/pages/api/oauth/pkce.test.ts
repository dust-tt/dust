import { beforeEach, describe, expect, vi } from "vitest";

import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./pkce";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("GET /api/oauth/pkce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  itInTransaction(
    "returns 400 when domain doesn't end with .salesforce.com",
    async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });
      req.query.domain = "https://test.invalid.com";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message: "The domain must end with .salesforce.com",
        },
      });
    }
  );

  itInTransaction(
    "returns 400 when domain doesn't start with https://",
    async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });
      req.query.domain = "http://test.salesforce.com";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message: "The domain must start with https://",
        },
      });
    }
  );

  itInTransaction("returns PKCE response when successful", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });
    req.query.domain = "https://test.salesforce.com";

    const mockPKCEResponse = {
      code_verifier: "test_verifier",
      code_challenge: "test_challenge",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPKCEResponse),
    });

    await handler(req, res);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://test.salesforce.com/services/oauth2/pkce/generator",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual(mockPKCEResponse);
  });
});
