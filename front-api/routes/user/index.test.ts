import { describe, expect, it } from "vitest";

import { computeSubscriberHash } from "@app/lib/notifications";
import { UserResource } from "@app/lib/resources/user_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

import { honoApp } from "@front-api/app";

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
