import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect, vi } from "vitest";

import { templateFactory } from "@app/tests/utils/TemplateFactory";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

// Mock the getSession function to return the user without going through the auth0 session
// Not sure to understand why it's not working with the generic_public_api_tests.ts mock
vi.mock(import("../../../lib/auth"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getSession: vi.fn().mockReturnValue(null),
  };
});

describe("GET /api/templates", () => {
  itInTransaction(
    "returns empty array when no published templates exist",
    async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        headers: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({ templates: [] });
    }
  );

  itInTransaction("returns only published templates", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: {},
    });

    // Create test templates
    const publishedTemplate1 = await templateFactory().published().create();
    const publishedTemplate2 = await templateFactory().published().create();
    await templateFactory().draft().create(); // Draft template should not be returned

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { templates } = res._getJSONData();
    expect(templates).toHaveLength(2);
    expect(templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          handle: publishedTemplate1.handle,
        }),
        expect.objectContaining({
          handle: publishedTemplate2.handle,
        }),
      ])
    );
  });

  itInTransaction("returns 405 for non-GET methods", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"] as const) {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method,
        headers: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
    }
  });
});
