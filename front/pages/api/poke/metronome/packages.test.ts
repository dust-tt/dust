import { listMetronomePackages } from "@app/lib/metronome/client";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./packages";

vi.mock("@app/lib/metronome/client", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/client")
  >("@app/lib/metronome/client");
  return {
    ...actual,
    listMetronomePackages: vi.fn(),
  };
});

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
        },
      ])
    );

    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: true,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      packages: [
        {
          id: "pkg_ent_usd",
          name: "Enterprise USD",
          aliases: ["enterprise-usd"],
        },
      ],
    });
  });

  it("returns 401 when the user is not a super user", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
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

  it("only supports GET", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
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
  });

  it("returns 502 when listing packages fails", async () => {
    vi.mocked(listMetronomePackages).mockResolvedValue(
      new Err(new Error("Metronome unavailable"))
    );

    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      isSuperUser: true,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(502);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "internal_server_error",
        message: "Failed to list Metronome packages: Metronome unavailable",
      },
    });
  });
});
