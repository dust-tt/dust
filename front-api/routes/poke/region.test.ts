import { config } from "@app/lib/api/regions/config";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/regions/config", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/lib/api/regions/config")>();
  return {
    ...mod,
    config: {
      ...mod.config,
      getCurrentRegion: vi.fn().mockReturnValue("us-central1"),
      getRegionUrl: vi.fn(),
    },
  };
});

describe("GET /api/poke/region", () => {
  it("returns correct region data when in us-central1", async () => {
    vi.mocked(config.getCurrentRegion).mockReturnValue("us-central1");
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await honoApp.request("/api/poke/region");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      region: "us-central1",
      regionUrls: expect.any(Object),
    });
  });

  it("returns correct region data when in europe-west1", async () => {
    vi.mocked(config.getCurrentRegion).mockReturnValue("europe-west1");
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await honoApp.request("/api/poke/region");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      region: "europe-west1",
      regionUrls: expect.any(Object),
    });
  });

  it("returns 200 when the user is a super user", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await honoApp.request("/api/poke/region");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      region: expect.any(String),
      regionUrls: expect.any(Object),
    });
  });

  it("returns 401 when the user is not a super user", async () => {
    await createPrivateApiMockRequest({ isSuperUser: false });

    const response = await honoApp.request("/api/poke/region");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "not_authenticated",
        message: "The user does not have permission",
      },
    });
  });
});
