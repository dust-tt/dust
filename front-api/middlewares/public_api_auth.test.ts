import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
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
    });
  });
  return app;
}

function get(
  app: ReturnType<typeof appReportingAuth>,
  { wId, secret, keyName }: { wId: string; secret: string; keyName?: string }
) {
  return app.request(`/${wId}`, {
    headers: {
      authorization: `Bearer ${secret}`,
      ...(keyName ? { "x-dust-api-key-name": keyName } : {}),
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
        role: "builder",
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
