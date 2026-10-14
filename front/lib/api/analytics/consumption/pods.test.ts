import { buildPodSpaceFilter } from "@app/lib/api/analytics/consumption/pods";
import { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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

  it("leaves out pods the caller cannot fetch", async () => {
    const { user, workspace } = await createResourceTest({ role: "user" });
    const pod = await SpaceFactory.project(workspace, user.id);
    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });
    const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      outsider.sId,
      workspace.sId
    );
    const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    expect((await buildPodSpaceFilter(memberAuth)).terms?.space_id).toEqual([
      pod.sId,
    ]);
    expect(await buildPodSpaceFilter(outsiderAuth)).toEqual({
      match_none: {},
    });
  });

  it("matches nothing in a workspace without pods", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    expect(await buildPodSpaceFilter(authenticator)).toEqual({
      match_none: {},
    });
  });
});
