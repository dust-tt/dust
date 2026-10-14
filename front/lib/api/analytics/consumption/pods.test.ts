import { buildPodSpaceFilter } from "@app/lib/api/analytics/consumption/pods";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { describe, expect, it } from "vitest";

describe("buildPodSpaceFilter", () => {
  it("keeps pods, deleted ones included, and leaves out other spaces", async () => {
    const { authenticator, user, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    const deletedPod = await SpaceFactory.project(workspace, user.id);
    await deletedPod.delete(authenticator, { hardDelete: false });
    const regularSpace = await SpaceFactory.regular(workspace);

    const filter = await buildPodSpaceFilter(authenticator);

    const podIds = filter.terms?.space_id;
    expect(podIds).toEqual(expect.arrayContaining([pod.sId, deletedPod.sId]));
    expect(podIds).not.toContain(regularSpace.sId);
  });

  it("matches nothing in a workspace without pods", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    expect(await buildPodSpaceFilter(authenticator)).toEqual({
      match_none: {},
    });
  });
});
