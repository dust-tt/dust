import { getWorkOSSessionWithSetCookies } from "@app/lib/api/workos/user";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/resources/kill_switch_resource", () => ({
  KillSwitchResource: {
    listEnabledKillSwitches: vi.fn(),
  },
}));

function getKillSwitches() {
  return honoApp.request("/api/kill");
}

describe("GET /api/kill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(KillSwitchResource.listEnabledKillSwitches).mockResolvedValue([
      "save_data_source_views",
    ]);
  });

  it("requires authentication", async () => {
    vi.mocked(getWorkOSSessionWithSetCookies).mockResolvedValue({
      session: null,
      setCookies: [],
    });

    const response = await getKillSwitches();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "not_authenticated",
        message:
          "The user does not have an active session or is not authenticated.",
      },
    });
    expect(KillSwitchResource.listEnabledKillSwitches).not.toHaveBeenCalled();
  });

  it("returns kill switches to authenticated users", async () => {
    await createPrivateApiMockRequest();

    const response = await getKillSwitches();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      killSwitches: ["save_data_source_views"],
    });
  });
});
