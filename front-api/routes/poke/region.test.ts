import { config as cellsConfig } from "@app/lib/api/cells/config";
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

vi.mock("@app/lib/api/cells/config", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/lib/api/cells/config")>();
  return {
    ...mod,
    config: {
      ...mod.config,
      getCurrentCell: vi.fn().mockReturnValue({
        name: "cell-00000",
        region: "us-central1",
        url: "https://cell-00000.dust.tt",
      }),
      getCellInfo: vi.fn((cell: "cell-00000" | "cell-00001") => ({
        name: cell,
        region: cell === "cell-00000" ? "us-central1" : "europe-west1",
        url: `https://${cell}.dust.tt`,
      })),
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
      currentCell: expect.any(Object),
      cells: expect.any(Array),
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
      currentCell: expect.any(Object),
      cells: expect.any(Array),
    });
  });

  it("returns 200 when the user is a super user", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await honoApp.request("/api/poke/region");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      region: expect.any(String),
      regionUrls: expect.any(Object),
      currentCell: expect.any(Object),
      cells: expect.any(Array),
    });
  });

  it("returns cell information with each cell region and url", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await honoApp.request("/api/poke/region");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cells).toEqual([
      {
        name: "cell-00000",
        region: "us-central1",
        url: "https://cell-00000.dust.tt",
      },
      {
        name: "cell-00001",
        region: "europe-west1",
        url: "https://cell-00001.dust.tt",
      },
    ]);
    expect(body.currentCell).toEqual({
      name: "cell-00000",
      region: "us-central1",
      url: "https://cell-00000.dust.tt",
    });
    expect(cellsConfig.getCurrentCell).toHaveBeenCalled();
    expect(cellsConfig.getCellInfo).toHaveBeenCalled();
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
