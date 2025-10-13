import { beforeEach, describe, expect, it, vi } from "vitest";

import { config } from "@app/lib/api/regions/config";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

import handler from "./pull";

const SAMPLE_TEMPLATE = {
  backgroundColor: "bg-blue-400",
  description: "Transform your raw written notes into a polished text.",
  emoji: "writing_hand/270d-fe0f",
  handle: "writeWell",
  helpActions: null,
  helpInstructions: null,
  pictureUrl:
    "https://dust.tt/static/emojis/bg-blue-400/writing_hand/270d-fe0f",
  presetActions: [],
  timeFrameDuration: null,
  timeFrameUnit: null,
  presetDescription: null,
  presetInstructions: "my instructions",
  presetModelId: "gpt-4o",
  presetProviderId: "openai",
  presetTemperature: "balanced",
  sId: "tpl_vomozn1XNz",
  tags: ["PRODUCTIVITY"],
  visibility: "published",
};

vi.mock(import("../../../../lib/api/regions/config"), async (importActual) => {
  const actualConfig = await importActual();
  return {
    ...actualConfig,
    config: {
      ...actualConfig.config,
      getDustRegionSyncEnabled: vi.fn(),
    },
  };
});

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe(
  "POST /api/poke/templates/pull",
  {
    sequential: true,
  },
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns 401 when the user is not a super user", async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "POST",
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

    it("returns 400 when called from with the sync disabled", async () => {
      vi.mocked(config.getDustRegionSyncEnabled).mockReturnValue(false);
      const { req, res } = await createPrivateApiMockRequest({
        method: "POST",
        isSuperUser: true,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "invalid_request_error",
          message: "This endpoint can only be called from non-main regions.",
        },
      });
    });

    it("only supports POST method", async () => {
      vi.mocked(config.getDustRegionSyncEnabled).mockReturnValue(true);
      for (const method of ["DELETE", "GET", "PUT", "PATCH"] as const) {
        const { req, res } = await createPrivateApiMockRequest({
          method,
          isSuperUser: true,
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

    it("handles failed templates list fetch", async () => {
      vi.mocked(config.getDustRegionSyncEnabled).mockReturnValue(true);

      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        })
      );

      const { req, res } = await createPrivateApiMockRequest({
        method: "POST",
        isSuperUser: true,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "internal_server_error",
          message: "Failed to fetch templates from main region.",
        },
      });
    });

    it("successfully pulls templates from main region", async () => {
      vi.mocked(config.getDustRegionSyncEnabled).mockReturnValue(true);

      // Mock the templates list response
      mockFetch
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                templates: [{ sId: "template1" }, { sId: "template2" }],
              }),
          })
        )
        // Mock individual template responses
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                ...SAMPLE_TEMPLATE,
                id: 1,
                sId: "template1",
                handle: "template1",
              }),
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                ...SAMPLE_TEMPLATE,
                id: 2,
                sId: "template2",
                handle: "template2",
              }),
          })
        );

      const { req, res } = await createPrivateApiMockRequest({
        method: "POST",
        isSuperUser: true,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        success: true,
        count: 2,
      });

      // Verify fetch was called correctly
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[0][0]).toContain("/api/templates");
      expect(mockFetch.mock.calls[1][0]).toContain("/api/templates/template1");
      expect(mockFetch.mock.calls[2][0]).toContain("/api/templates/template2");
    });

    it("handles failed template fetches gracefully", async () => {
      vi.mocked(config.getDustRegionSyncEnabled).mockReturnValue(true);

      // Mock the templates list response
      mockFetch
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                templates: [{ sId: "template1" }, { sId: "template2" }],
              }),
          })
        )
        // Mock one successful and one failed template fetch
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                ...SAMPLE_TEMPLATE,
                id: 1,
                sId: "template1",
                handle: "template1",
              }),
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: false,
            status: 500,
          })
        );

      const { req, res } = await createPrivateApiMockRequest({
        method: "POST",
        isSuperUser: true,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual({
        success: true,
        count: 1, // Only one template should be successfully processed
      });
    });
  }
);
