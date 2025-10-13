import { describe, expect, it, vi } from "vitest";

import { config } from "@app/lib/api/regions/config";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

import handler from "./region";

vi.mock(import("../../../lib/api/regions/config"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    config: {
      ...mod.config,
      getCurrentRegion: vi.fn(),
      getRegionUrl: vi.fn(),
    },
  };
});

describe("GET /api/poke/region", () => {
  it("returns correct region data when in us-central1", async () => {
    vi.mocked(config.getCurrentRegion).mockReturnValue("us-central1");
    const { req, res } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      region: "us-central1",
      regionUrls: expect.any(Object),
    });
  });

  it("returns correct region data when in europe-west1", async () => {
    vi.mocked(config.getCurrentRegion).mockReturnValue("europe-west1");
    const { req, res } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      region: "europe-west1",
      regionUrls: expect.any(Object),
    });
  });

  it("returns 200 when the user is a super user", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      region: expect.any(String),
      regionUrls: expect.any(Object),
    });
  });

  it("returns 401 when the user is not a super user", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      isSuperUser: false,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "not_authenticated",
        message: "The user does not have permission",
      },
    });
  });

  it("only supports GET method", async () => {
    for (const method of ["DELETE", "POST", "PUT", "PATCH"] as const) {
      const { req, res } = await createPrivateApiMockRequest({
        method,
        isSuperUser: true,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
    }
  });
});
