import { Authenticator } from "@app/lib/auth";
import { PodEgressPolicyResource } from "@app/lib/resources/pod_egress_policy_resource";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

async function setupTest() {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  return { workspace, auth };
}

describe("PodEgressPolicyResource", () => {
  it("returns null for a pod with no policy", async () => {
    const { workspace, auth } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    const policy = await PodEgressPolicyResource.fetchBySpace(auth, pod);

    expect(policy).toBeNull();
  });

  it("returns null for non-project spaces", async () => {
    const { workspace, auth } = await setupTest();
    const space = await SpaceFactory.regular(workspace);

    const policy = await PodEgressPolicyResource.fetchBySpace(auth, space);

    expect(policy).toBeNull();
  });

  it("creates, fetches and updates a pod policy", async () => {
    const { workspace, auth } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    await PodEgressPolicyResource.makeNew(auth, pod, {
      allowedDomains: ["api.github.com"],
    });

    const fetched = await PodEgressPolicyResource.fetchBySpace(auth, pod);
    expect(fetched?.allowedDomains).toEqual(["api.github.com"]);

    await fetched?.updateAllowedDomains(["api.github.com", "*.npmjs.org"]);

    const updated = await PodEgressPolicyResource.fetchBySpace(auth, pod);
    expect(updated?.allowedDomains).toEqual(["api.github.com", "*.npmjs.org"]);
  });

  it("scopes policies to their pod", async () => {
    const { workspace, auth } = await setupTest();
    const podA = await SpaceFactory.project(workspace);
    const podB = await SpaceFactory.project(workspace);

    await PodEgressPolicyResource.makeNew(auth, podA, {
      allowedDomains: ["a.example.com"],
    });

    const policyB = await PodEgressPolicyResource.fetchBySpace(auth, podB);
    expect(policyB).toBeNull();
  });

  it("deletes policies by space", async () => {
    const { workspace, auth } = await setupTest();
    const pod = await SpaceFactory.project(workspace);

    await PodEgressPolicyResource.makeNew(auth, pod, {
      allowedDomains: ["api.github.com"],
    });

    await PodEgressPolicyResource.deleteBySpace(auth, pod);

    const fetched = await PodEgressPolicyResource.fetchBySpace(auth, pod);
    expect(fetched).toBeNull();
  });
});
