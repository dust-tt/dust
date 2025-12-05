import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import { TemplateFactory } from "@app/tests/utils/TemplateFactory";

import handler from "./index";

// Mock the getSession function to return the user without going through the workos session
vi.mock(import("../../../../lib/auth"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getSession: vi.fn().mockReturnValue(null),
  };
});

describe("GET /api/templates/[tId]", () => {
  it("returns 404 when template id is not provided", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {},
      headers: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "template_not_found",
        message: "Template not found.",
      },
    });
  });

  it("returns 404 when template does not exist", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { tId: "non-existent-id" },
      headers: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "template_not_found",
        message: "Template not found.",
      },
    });
  });

  it("returns 404 when template is not published", async () => {
    const template = await TemplateFactory.draft();

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { tId: template.sId },
      headers: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "template_not_found",
        message: "Template not found.",
      },
    });
  });

  it("returns template when it exists and is published", async () => {
    const template = await TemplateFactory.published();

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { tId: template.sId },
      headers: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual(
      expect.objectContaining({
        handle: template.handle,
      })
    );
  });

  it("returns 405 for non-GET methods", async () => {
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
