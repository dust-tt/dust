import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { createHono } from "@front-api/lib/hono";
import type { PublicApiCtx } from "@front-api/middlewares/ctx";
import { describe, expect, it } from "vitest";

import { publicApiAuth } from "./public_api_auth";

// Mounts publicApiAuth on a throwaway route that reports what the resolved
// Authenticator carries, so the header handling can be asserted directly
// instead of through a downstream endpoint.
function appReportingAuth() {
  const app = createHono<PublicApiCtx>();
  app.use("/:wId", publicApiAuth);
  app.get("/:wId", (ctx) => {
    const auth = ctx.get("auth");
    return ctx.json({
      attributionKeyName: auth.attributionKey()?.name ?? null,
      attributionKeyModelId: auth.attributionKeyModelId(),
      keyModelId: auth.key()?.id ?? null,
      keyName: auth.key()?.name ?? null,
      keyIsSystem: auth.key()?.isSystem ?? null,
      role: auth.role(),
      userId: auth.user()?.sId ?? null,
    });
  });
  return app;
}

function get(
  app: ReturnType<typeof appReportingAuth>,
  {
    wId,
    secret,
    keyName,
    headers = {},
  }: {
    wId: string;
    secret: string;
    keyName?: string;
    headers?: Record<string, string>;
  }
) {
  return app.request(`/${wId}`, {
    headers: {
      authorization: `Bearer ${secret}`,
      ...(keyName ? { "x-dust-api-key-name": keyName } : {}),
      ...headers,
    },
  });
}

describe("publicApiAuth — x-dust-api-key-name attribution", () => {
  it("attributes a system-key request to the forwarded key without touching auth.key()", async () => {
    const {
      workspace,
      globalGroup,
      key: systemKey,
    } = await createPublicApiMockRequest({ systemKey: true });
    const originatingKey = await KeyFactory.regular(globalGroup);

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      keyName: originatingKey.name,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        attributionKeyName: originatingKey.name,
        attributionKeyModelId: originatingKey.id,
        // Attribution only: authorization keeps operating on the system key.
        keyModelId: systemKey.id,
        keyName: systemKey.name,
        keyIsSystem: true,
        role: "admin",
      })
    );
  });

  it("ignores the header when the request is not authenticated with a system key", async () => {
    const {
      workspace,
      globalGroup,
      key: regularKey,
    } = await createPublicApiMockRequest();
    const otherKey = await KeyFactory.admin(globalGroup);

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: regularKey.secret,
      keyName: otherKey.name,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        attributionKeyName: null,
        attributionKeyModelId: null,
        keyModelId: regularKey.id,
        keyIsSystem: false,
        // The header must not grant the other key's role.
        role: "user",
      })
    );
  });

  it("ignores a name that resolves to a system key", async () => {
    const {
      workspace,
      globalGroup,
      key: systemKey,
    } = await createPublicApiMockRequest({ systemKey: true });
    const otherSystemKey = await KeyFactory.system(globalGroup);

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      keyName: otherSystemKey.name,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        attributionKeyName: null,
        attributionKeyModelId: null,
      })
    );
  });

  it("ignores a name that resolves to a disabled key", async () => {
    const {
      workspace,
      globalGroup,
      key: systemKey,
    } = await createPublicApiMockRequest({ systemKey: true });
    const disabledKey = await KeyFactory.disabled(globalGroup);

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      keyName: disabledKey.name,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        attributionKeyName: null,
        attributionKeyModelId: null,
      })
    );
  });

  it("ignores a key name from another workspace", async () => {
    const { workspace, key: systemKey } = await createPublicApiMockRequest({
      systemKey: true,
    });
    const other = await createPublicApiMockRequest();

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      keyName: other.key.name,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        attributionKeyName: null,
        attributionKeyModelId: null,
      })
    );
  });

  it("ignores an unknown key name", async () => {
    const { workspace, key: systemKey } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      keyName: "no-such-key",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        attributionKeyName: null,
        attributionKeyModelId: null,
      })
    );
  });
});

describe("publicApiAuth — x-api-user-email impersonation", () => {
  it("acts as the matching member with the user role", async () => {
    const { workspace, key: systemKey } = await createPublicApiMockRequest({
      systemKey: true,
    });
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      headers: { "x-api-user-email": user.email },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ userId: user.sId, role: "user" })
    );
  });

  it("rejects an unscoped request when no member matches", async () => {
    const { workspace, key: systemKey } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      headers: { "x-api-user-email": "not-a-member@example.com" },
    });

    expect(response.status).toBe(401);
  });

  it("keeps a group-scoped request without the admin role when no member matches", async () => {
    const {
      workspace,
      globalGroup,
      key: systemKey,
    } = await createPublicApiMockRequest({ systemKey: true });

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      headers: {
        "x-api-user-email": "external@whitelisted.example.com",
        "x-dust-group-ids": globalGroup.sId,
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ userId: null, role: "user" })
    );
  });

  it("rejects an email shared by several members", async () => {
    const { workspace, key: systemKey } = await createPublicApiMockRequest({
      systemKey: true,
    });
    const first = await UserFactory.withEmail("shared@example.com");
    const second = await UserFactory.withEmail("shared@example.com");
    await MembershipFactory.associate(workspace, first, { role: "admin" });
    await MembershipFactory.associate(workspace, second, { role: "user" });

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      headers: { "x-api-user-email": "shared@example.com" },
    });

    expect(response.status).toBe(401);
  });
});
