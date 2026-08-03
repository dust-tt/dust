import { listPodsForScope } from "@app/lib/api/projects/list";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("listPodsForScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only member Pods for the member access", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "user",
    });

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const memberPod = await SpaceFactory.project(workspace);
    const otherPod = await SpaceFactory.project(workspace);

    await ProjectMetadataResource.makeNew(adminAuth, memberPod, {
      description: null,
    });
    await ProjectMetadataResource.makeNew(adminAuth, otherPod, {
      description: null,
    });

    await memberPod.addMembers(adminAuth, { userIds: [user.sId] });
    await auth.refresh();

    const { pods, total } = await listPodsForScope(auth, {
      access: "member",
      pagination: { limit: 100, pageOffset: 0 },
    });

    expect(total).toBe(pods.length);
    expect(pods.some((pod) => pod.sId === memberPod.sId)).toBe(true);
    expect(pods.some((pod) => pod.sId === otherPod.sId)).toBe(false);
  });

  it("returns readable open Pods for the open access", async () => {
    vi.spyOn(
      await import("@app/lib/api/projects/connector"),
      "createDataSourceAndConnectorForProject"
    ).mockResolvedValue(new Ok(undefined));

    const {
      workspace,
      user,
      auth: adminAuth,
    } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const openPodRes = await createSpaceAndGroup(adminAuth, {
      name: "Open Alpha Pod",
      isRestricted: false,
      spaceKind: "project",
      managementMode: "manual",
      memberIds: [],
    });
    expect(openPodRes.isOk()).toBe(true);

    const privatePod = await SpaceFactory.project(workspace);
    await ProjectMetadataResource.makeNew(adminAuth, privatePod, {
      description: null,
    });

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const { pods, total } = await listPodsForScope(userAuth, {
      access: "open",
      pagination: { limit: 100, pageOffset: 0 },
    });

    expect(total).toBe(pods.length);
    expect(pods.some((pod) => pod.name === "Open Alpha Pod")).toBe(true);
    expect(pods.some((pod) => pod.sId === privatePod.sId)).toBe(false);
  });

  it("filters Pods by name case-insensitively", async () => {
    vi.spyOn(
      await import("@app/lib/api/projects/connector"),
      "createDataSourceAndConnectorForProject"
    ).mockResolvedValue(new Ok(undefined));

    const { auth: adminAuth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const alphaPodRes = await createSpaceAndGroup(adminAuth, {
      name: "Alpha Launch",
      isRestricted: false,
      spaceKind: "project",
      managementMode: "manual",
      memberIds: [],
    });
    expect(alphaPodRes.isOk()).toBe(true);

    const betaPodRes = await createSpaceAndGroup(adminAuth, {
      name: "Beta Rollout",
      isRestricted: false,
      spaceKind: "project",
      managementMode: "manual",
      memberIds: [],
    });
    expect(betaPodRes.isOk()).toBe(true);

    const { pods, total } = await listPodsForScope(adminAuth, {
      access: "open",
      q: "alpha",
      pagination: { limit: 100, pageOffset: 0 },
    });

    expect(total).toBe(1);
    expect(pods).toHaveLength(1);
    expect(pods[0]?.name).toBe("Alpha Launch");
  });

  it("ignores diacritics when filtering by name", async () => {
    vi.spyOn(
      await import("@app/lib/api/projects/connector"),
      "createDataSourceAndConnectorForProject"
    ).mockResolvedValue(new Ok(undefined));

    const { auth: adminAuth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const cafePodRes = await createSpaceAndGroup(adminAuth, {
      name: "Café Launch",
      isRestricted: false,
      spaceKind: "project",
      managementMode: "manual",
      memberIds: [],
    });
    expect(cafePodRes.isOk()).toBe(true);

    const { pods, total } = await listPodsForScope(adminAuth, {
      access: "open",
      q: "cafe",
      pagination: { limit: 100, pageOffset: 0 },
    });

    expect(total).toBe(1);
    expect(pods).toHaveLength(1);
    expect(pods[0]?.name).toBe("Café Launch");
  });
});
