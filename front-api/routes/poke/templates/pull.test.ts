import { config } from "@app/lib/api/regions/config";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SAMPLE_TEMPLATE = {
  backgroundColor: "bg-blue-400",
  userFacingDescription:
    "Transform your raw written notes into a polished text.",
  agentFacingDescription:
    "Transform your raw written notes into a polished text.",
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

vi.mock("@app/lib/api/regions/config", async (importActual) => {
  const mod =
    await importActual<typeof import("@app/lib/api/regions/config")>();
  return {
    ...mod,
    config: {
      ...mod.config,
      getDustRegionSyncEnabled: vi.fn(),
      getDustRegionSyncMasterUrl: vi
        .fn()
        .mockReturnValue("https://main.dust.tt"),
    },
  };
});

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function pullTemplates() {
  return honoApp.request("/api/poke/templates/pull", { method: "POST" });
}

describe("POST /api/poke/templates/pull", { sequential: true }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is not a super user", async () => {
    await createPrivateApiMockRequest({ isSuperUser: false });

    const response = await pullTemplates();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "not_authenticated",
        message: "The user does not have permission",
      },
    });
  });

  it("returns 400 when called with the sync disabled", async () => {
    vi.mocked(config.getDustRegionSyncEnabled).mockReturnValue(false);
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await pullTemplates();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "This endpoint can only be called from non-main regions.",
      },
    });
  });

  it("handles failed templates list fetch", async () => {
    vi.mocked(config.getDustRegionSyncEnabled).mockReturnValue(true);

    mockFetch.mockImplementationOnce(function () {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });
    });

    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await pullTemplates();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
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
      .mockImplementationOnce(function () {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              templates: [{ sId: "template1" }, { sId: "template2" }],
            }),
        });
      })
      // Mock individual template responses
      .mockImplementationOnce(function () {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ...SAMPLE_TEMPLATE,
              id: 1,
              sId: "template1",
              handle: "template1",
            }),
        });
      })
      .mockImplementationOnce(function () {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ...SAMPLE_TEMPLATE,
              id: 2,
              sId: "template2",
              handle: "template2",
            }),
        });
      });

    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await pullTemplates();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
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
      .mockImplementationOnce(function () {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              templates: [{ sId: "template1" }, { sId: "template2" }],
            }),
        });
      })
      // Mock one successful and one failed template fetch
      .mockImplementationOnce(function () {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ...SAMPLE_TEMPLATE,
              id: 1,
              sId: "template1",
              handle: "template1",
            }),
        });
      })
      .mockImplementationOnce(function () {
        return Promise.resolve({
          ok: false,
          status: 500,
        });
      });

    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await pullTemplates();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      count: 1, // Only one template should be successfully processed
    });
  });
});
