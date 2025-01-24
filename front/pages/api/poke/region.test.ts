import { describe, expect, vi } from "vitest";

import { config } from "@app/lib/api/regions/config";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./region";

vi.mock(import("../../../lib/api/regions/config"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    config: {
      ...mod.config,
      getCurrentRegion: vi.fn(),
    },
  };
});

describe("GET /api/poke/region", () => {
  itInTransaction(
    "returns correct region data when in us-central1",
    async () => {
      vi.mocked(config.getCurrentRegion).mockReturnValue("us-central1");
      const { req, res } = await createPrivateApiMockRequest({
        isSuperUser: true,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        region: "us-central1",
      });
    }
  );

  itInTransaction(
    "returns correct region data when in europe-west1",
    async () => {
      vi.mocked(config.getCurrentRegion).mockReturnValue("europe-west1");
      const { req, res } = await createPrivateApiMockRequest({
        isSuperUser: true,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        region: "europe-west1",
      });
    }
  );

  itInTransaction("returns 200 when the user is a super user", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      region: expect.any(String),
    });
  });

  itInTransaction("returns 404 when the user is not a super user", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      isSuperUser: false,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  });

  itInTransaction("only supports GET method", async () => {
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
