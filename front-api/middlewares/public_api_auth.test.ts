import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
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
      requestedGroupModelIds: auth._requestedGroupModelIds,
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
    extraHeaders,
  }: {
    wId: string;
    secret: string;
    keyName?: string;
    extraHeaders?: Record<string, string>;
  }
) {
  return app.request(`/${wId}`, {
    headers: {
      authorization: `Bearer ${secret}`,
      ...(keyName ? { "x-dust-api-key-name": keyName } : {}),
      ...extraHeaders,
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
  it("acts as the active member the email resolves to", async () => {
    const { workspace, key: systemKey } = await createPublicApiMockRequest({
      systemKey: true,
    });
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      extraHeaders: { "x-api-user-email": user.email },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ userId: user.sId, role: "user" })
    );
  });

  it("matches the member's email regardless of letter case", async () => {
    const { workspace, key: systemKey } = await createPublicApiMockRequest({
      systemKey: true,
    });
    const user = await UserFactory.withEmail("alice@acme.test");
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      extraHeaders: { "x-api-user-email": "Alice@Acme.test" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ userId: user.sId, role: "user" })
    );
  });

  it("rejects an email that resolves to no member when no groups are named", async () => {
    const { workspace, key: systemKey } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      extraHeaders: { "x-api-user-email": "nobody@acme.test" },
    });

    expect(response.status).toBe(401);
  });

  it("rejects an empty email instead of keeping the system key defaults", async () => {
    const { workspace, key: systemKey } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      extraHeaders: { "x-api-user-email": "" },
    });

    expect(response.status).toBe(401);
  });

  it("rejects an email whose user is not a member of the workspace", async () => {
    const { workspace, key: systemKey } = await createPublicApiMockRequest({
      systemKey: true,
    });
    const outsider = await UserFactory.basic();

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      extraHeaders: { "x-api-user-email": outsider.email },
    });

    expect(response.status).toBe(401);
  });

  it("rejects an email that resolves to no member when the named groups are all blank", async () => {
    const { workspace, key: systemKey } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      extraHeaders: {
        "x-api-user-email": "nobody@acme.test",
        "x-dust-group-ids": " , ",
      },
    });

    expect(response.status).toBe(401);
  });

  it("keeps only the named groups and the user role when the email resolves to no member", async () => {
    const { workspace, key: systemKey } = await createPublicApiMockRequest({
      systemKey: true,
    });
    const group = await GroupFactory.regularManual(workspace, "Guests");

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: systemKey.secret,
      extraHeaders: {
        "x-api-user-email": "guest@partner.test",
        "x-dust-group-ids": group.sId,
        // A requested role must not lift the fallback above `user`.
        "x-dust-role": "admin",
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        userId: null,
        role: "user",
        requestedGroupModelIds: [group.id],
      })
    );
  });

  it("ignores the header on a regular key", async () => {
    const { workspace, key: regularKey } = await createPublicApiMockRequest();

    const response = await get(appReportingAuth(), {
      wId: workspace.sId,
      secret: regularKey.secret,
      extraHeaders: { "x-api-user-email": "nobody@acme.test" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ userId: null, keyIsSystem: false })
    );
  });
});
