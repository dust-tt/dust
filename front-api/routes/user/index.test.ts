import { computeSubscriberHash } from "@app/lib/notifications";
import { UserResource } from "@app/lib/resources/user_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getUser() {
  return honoApp.request(`/api/user`);
}

function patchUser(body: unknown) {
  return honoApp.request(`/api/user`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/user/metadata/:key", () => {
  it("deletes a prefix only in the selected user's workspace", async () => {
    const { user, workspace } = await createPrivateApiMockRequest();
    const otherWorkspace = await WorkspaceFactory.basic();
    const otherUser = await UserFactory.basic();
    const key = "test-preference:first";
    const secondKey = "test-preference:second";

    await user.setMetadata(key, "workspace", workspace.id);
    await user.setMetadata(secondKey, "workspace", workspace.id);
    await user.setMetadata("keep", "workspace", workspace.id);
    await user.setMetadata(key, "other-workspace", otherWorkspace.id);
    await user.setMetadata(key, "global");
    await otherUser.setMetadata(key, "other-user", workspace.id);

    const response = await honoApp.request(
      `/api/user/metadata/test-preference%3A?workspaceId=${workspace.sId}`,
      { method: "DELETE" }
    );

    expect(response.status).toBe(200);
    expect(await user.getMetadata(key, workspace.id)).toBeNull();
    expect(await user.getMetadata(secondKey, workspace.id)).toBeNull();
    expect((await user.getMetadata("keep", workspace.id))?.value).toBe(
      "workspace"
    );
    expect((await user.getMetadata(key, otherWorkspace.id))?.value).toBe(
      "other-workspace"
    );
    expect((await user.getMetadata(key))?.value).toBe("global");
    expect((await otherUser.getMetadata(key, workspace.id))?.value).toBe(
      "other-user"
    );
  });

  it("deletes only global metadata when no workspace is selected", async () => {
    const { user, workspace } = await createPrivateApiMockRequest();
    const key = "test-preference:first";

    await user.setMetadata(key, "global");
    await user.setMetadata(key, "workspace", workspace.id);

    const response = await honoApp.request(
      "/api/user/metadata/test-preference%3A",
      {
        method: "DELETE",
      }
    );

    expect(response.status).toBe(200);
    expect(await user.getMetadata(key)).toBeNull();
    expect((await user.getMetadata(key, workspace.id))?.value).toBe(
      "workspace"
    );
  });
});

describe("GET /api/user", () => {
  it("returns 200 when the user is authenticated", async () => {
    const { user, workspace, membership } = await createPrivateApiMockRequest();

    const response = await getUser();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: {
        id: user.id,
        sId: user.sId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        provider: user.provider,
        fullName: `${user.firstName} ${user.lastName}`,
        image: user.imageUrl,
        createdAt: user.createdAt.getTime(),
        lastLoginAt: user.lastLoginAt?.getTime(),
        organizations: [],
        selectedWorkspace: workspace.sId,
        workspaces: [
          {
            id: workspace.id,
            sId: workspace.sId,
            name: workspace.name,
            metadata: null,
            metronomeCustomerId: null,
            role: membership.role,
            segmentation: workspace.segmentation,
            whiteListedProviders: workspace.whiteListedProviders,
            defaultEmbeddingProvider: workspace.defaultEmbeddingProvider,
            sharingPolicy: "all_scopes",
            ssoEnforced: workspace.ssoEnforced,
            workOSOrganizationId: workspace.workOSOrganizationId,
            regionalModelsOnly: workspace.regionalModelsOnly,
          },
        ],
        subscriberHash: computeSubscriberHash(user.sId),
      },
    });
  });

  it("returns 200 with subscriber hash", async () => {
    const { user, workspace, membership } = await createPrivateApiMockRequest();

    const response = await getUser();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: {
        id: user.id,
        sId: user.sId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        provider: user.provider,
        fullName: `${user.firstName} ${user.lastName}`,
        image: user.imageUrl,
        createdAt: user.createdAt.getTime(),
        lastLoginAt: user.lastLoginAt?.getTime(),
        organizations: [],
        selectedWorkspace: workspace.sId,
        workspaces: [
          {
            id: workspace.id,
            sId: workspace.sId,
            name: workspace.name,
            metadata: null,
            metronomeCustomerId: null,
            role: membership.role,
            segmentation: workspace.segmentation,
            whiteListedProviders: workspace.whiteListedProviders,
            defaultEmbeddingProvider: workspace.defaultEmbeddingProvider,
            sharingPolicy: "all_scopes",
            ssoEnforced: workspace.ssoEnforced,
            workOSOrganizationId: workspace.workOSOrganizationId,
            regionalModelsOnly: workspace.regionalModelsOnly,
          },
        ],
        subscriberHash: computeSubscriberHash(user.sId),
      },
    });
  });
});

describe("PATCH /api/user", () => {
  it("updates the user", async () => {
    const { user } = await createPrivateApiMockRequest({ method: "PATCH" });

    const response = await patchUser({ firstName: "John", lastName: "Doe" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const userAfterUpdate = await UserResource.fetchById(user.sId);
    expect(userAfterUpdate?.firstName).toBe("John");
    expect(userAfterUpdate?.lastName).toBe("Doe");
  });

  it("requires firstName and lastName", async () => {
    await createPrivateApiMockRequest({ method: "PATCH" });

    const response = await patchUser({});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.objectContaining({
        type: "invalid_request_error",
        message: expect.stringContaining("firstName"),
      }),
    });
  });

  it("ignores unknown fields", async () => {
    await createPrivateApiMockRequest({ method: "PATCH" });

    const response = await patchUser({
      firstName: "John",
      lastName: "Doe",
      unknownField: "unknownValue",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });
});
