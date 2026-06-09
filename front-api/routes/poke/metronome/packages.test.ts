import { listMetronomePackages } from "@app/lib/metronome/client";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/client")
  >("@app/lib/metronome/client");
  return {
    ...actual,
    listMetronomePackages: vi.fn(),
  };
});

function getPackages() {
  return honoApp.request("/api/poke/metronome/packages");
}

describe("GET /api/poke/metronome/packages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns packages for a super user", async () => {
    vi.mocked(listMetronomePackages).mockResolvedValue(
      new Ok([
        {
          id: "pkg_ent_usd",
          name: "Enterprise USD",
          aliases: ["enterprise-usd"],
          tier: "enterprise",
          currency: "usd",
          seats: [],
        },
      ])
    );

    await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: true,
    });

    const response = await getPackages();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      packages: [
        {
          id: "pkg_ent_usd",
          name: "Enterprise USD",
          aliases: ["enterprise-usd"],
          tier: "enterprise",
          currency: "usd",
          seats: [],
        },
      ],
    });
  });

  it("returns 401 when the user is not a super user", async () => {
    await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: false,
    });

    const response = await getPackages();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "not_authenticated",
        message: "The user does not have permission",
      },
    });
  });

  it("returns 502 when listing packages fails", async () => {
    vi.mocked(listMetronomePackages).mockResolvedValue(
      new Err(new Error("Metronome unavailable"))
    );

    await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: true,
    });

    const response = await getPackages();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        type: "internal_server_error",
        message: "Failed to list Metronome packages: Metronome unavailable",
      },
    });
  });
});
