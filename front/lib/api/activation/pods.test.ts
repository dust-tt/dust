import { listActivationPodsByUser } from "@app/lib/api/activation/pods";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { describe, expect, it } from "vitest";

describe("listActivationPodsByUser", () => {
  it("omits users whose only activation pod is archived", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    await ActivationPodResource.makeNew(authenticator, { pod, user });
    await ProjectMetadataResource.makeNew(authenticator, pod, {
      description: null,
      archivedAt: new Date(),
    });

    const byUser = await listActivationPodsByUser(authenticator);

    expect(byUser.has(user.id)).toBe(false);
  });

  it("includes users with a live activation pod", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    await ActivationPodResource.makeNew(authenticator, { pod, user });
    await ProjectMetadataResource.makeNew(authenticator, pod, {
      description: null,
    });

    const byUser = await listActivationPodsByUser(authenticator);

    expect(byUser.get(user.id)?.pod.sId).toBe(pod.sId);
  });
});
