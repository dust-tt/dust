import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getActivationPod(wId: string) {
  return honoApp.request(`/api/w/${wId}/activation-pod`);
}

describe("GET /api/w/:wId/activation-pod", () => {
  it("returns null when the user has no activation pod", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await getActivationPod(workspace.sId);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ podId: null });
  });

  it("returns the pod space sId when the user has an activation pod", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();

    const user = auth.getNonNullableUser();
    const [userResource] = await UserResource.fetchByModelIds([user.id]);
    const podSpace = await SpaceFactory.regular(workspace);

    await ActivationPodResource.makeNew(auth, {
      pod: podSpace,
      user: userResource,
    });

    const response = await getActivationPod(workspace.sId);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ podId: podSpace.sId });
  });
});
