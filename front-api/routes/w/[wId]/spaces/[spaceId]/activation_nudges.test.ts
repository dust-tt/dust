import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getSettings(workspace: { sId: string }, spaceId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/activation_nudges`
  );
}

function patchSettings(
  workspace: { sId: string },
  spaceId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/activation_nudges`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("GET /api/w/:wId/spaces/:spaceId/activation_nudges", () => {
  it("reports nudges as on for the pod's own user", async () => {
    const { workspace, auth, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    await ActivationPodResource.makeNew(auth, { pod, user });

    const response = await getSettings(workspace, pod.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.activationNudgeSettings).toEqual({ nudgesEnabled: true });
  });

  it("returns no settings for a space that is not an Activation Pod", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const pod = await SpaceFactory.project(workspace, user.id);

    const response = await getSettings(workspace, pod.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.activationNudgeSettings).toBeNull();
  });

  it("returns no settings for someone else's Activation Pod", async () => {
    const { workspace, auth, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const otherUser = await UserFactory.basic();
    const pod = await SpaceFactory.project(workspace, user.id);
    await ActivationPodResource.makeNew(auth, { pod, user: otherUser });

    const response = await getSettings(workspace, pod.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.activationNudgeSettings).toBeNull();
  });
});

describe("PATCH /api/w/:wId/spaces/:spaceId/activation_nudges", () => {
  it("turns nudges off and back on", async () => {
    const { workspace, auth, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    const activationPod = await ActivationPodResource.makeNew(auth, {
      pod,
      user,
    });

    const offResponse = await patchSettings(workspace, pod.sId, {
      nudgesEnabled: false,
    });
    expect(offResponse.status).toBe(200);
    expect((await offResponse.json()).activationNudgeSettings).toEqual({
      nudgesEnabled: false,
    });

    const disabled = await ActivationPodResource.fetchBySpace(auth, pod);
    expect(disabled?.nudgesDisabledAt).not.toBeNull();

    const onResponse = await patchSettings(workspace, pod.sId, {
      nudgesEnabled: true,
    });
    expect(onResponse.status).toBe(200);

    const enabled = await ActivationPodResource.fetchBySpace(auth, pod);
    expect(enabled?.nudgesDisabledAt).toBeNull();
    expect(activationPod.id).toBe(enabled?.id);
  });

  it("does not let someone else's pod be turned off", async () => {
    const { workspace, auth, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const otherUser = await UserFactory.basic();
    const pod = await SpaceFactory.project(workspace, user.id);
    await ActivationPodResource.makeNew(auth, { pod, user: otherUser });

    const response = await patchSettings(workspace, pod.sId, {
      nudgesEnabled: false,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).activationNudgeSettings).toBeNull();

    const untouched = await ActivationPodResource.fetchBySpace(auth, pod);
    expect(untouched?.nudgesDisabledAt).toBeNull();
  });
});
