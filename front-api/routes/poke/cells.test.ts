import { config as cellsConfig } from "@app/lib/api/cells/config";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

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
      getCellUrl: vi.fn((cell: "cell-00000" | "cell-00001") =>
        cell === "cell-00000"
          ? "https://cell-00000.dust.tt"
          : "https://cell-00001.dust.tt"
      ),
    },
  };
});

describe("GET /api/poke/cells", () => {
  it("returns 200 when the user is a super user", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await honoApp.request("/api/poke/cells");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      currentCell: expect.any(Object),
      cells: expect.any(Array),
    });
  });

  it("returns the current cell and all cells with region and url", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await honoApp.request("/api/poke/cells");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.currentCell).toEqual({
      name: "cell-00000",
      region: "us-central1",
      url: "https://cell-00000.dust.tt",
    });
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
    expect(cellsConfig.getCurrentCell).toHaveBeenCalled();
    expect(cellsConfig.getCellInfo).toHaveBeenCalled();
    expect(cellsConfig.getCellUrl).toHaveBeenCalled();
  });

  it("returns 401 when the user is not a super user", async () => {
    await createPrivateApiMockRequest({ isSuperUser: false });

    const response = await honoApp.request("/api/poke/cells");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "not_authenticated",
        message: "The user does not have permission",
      },
    });
  });
});
