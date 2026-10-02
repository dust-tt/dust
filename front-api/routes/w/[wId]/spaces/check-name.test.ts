import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function checkName(workspace: { sId: string }, name: string) {
  const qs = new URLSearchParams({ name }).toString();
  return honoApp.request(`/api/w/${workspace.sId}/spaces/check-name?${qs}`);
}

describe("GET /api/w/:wId/spaces/check-name", () => {
  it("returns 400 without a name", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await checkName(workspace, "");

    expect(response.status).toBe(400);
  });

  it("does not let members probe restricted space names with pattern characters", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });
    const restrictedSpace = await SpaceFactory.regular(workspace);

    const probes = [
      "%",
      `${restrictedSpace.name.slice(0, 3)}%`,
      restrictedSpace.name.replace(/ /g, "_"),
      "_".repeat(restrictedSpace.name.length),
    ];
    for (const probe of probes) {
      const response = await checkName(workspace, probe);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ available: true });
    }
  });

  it("reports an existing name as unavailable regardless of case", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });
    const restrictedSpace = await SpaceFactory.regular(workspace);

    for (const name of [
      restrictedSpace.name,
      restrictedSpace.name.toUpperCase(),
      ` ${restrictedSpace.name} `,
    ]) {
      const response = await checkName(workspace, name);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ available: false });
    }
  });
});
