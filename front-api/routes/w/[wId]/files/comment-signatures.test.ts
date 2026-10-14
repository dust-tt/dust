import { generateKeyPairSync } from "node:crypto";
import config from "@app/lib/api/config";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

// EnvironmentConfig caches variables, so the key is stubbed on config rather than the env.
beforeEach(() => {
  vi.spyOn(config, "getDfmCommentSigningKey").mockReturnValue(
    privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const url = (workspaceId: string) =>
  `/api/w/${workspaceId}/files/comment-signatures`;

describe("GET /api/w/:wId/files/comment-signatures", () => {
  it("returns the public key matching the signing key", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await honoApp.request(url(workspace.sId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      publicKey: publicKey
        .export({ format: "der", type: "spki" })
        .toString("base64url"),
    });
  });

  it("returns null without a signing key", async () => {
    vi.mocked(config.getDfmCommentSigningKey).mockReturnValue(undefined);
    const { workspace } = await createPrivateApiMockRequest();

    const response = await honoApp.request(url(workspace.sId));

    expect(await response.json()).toEqual({ publicKey: null });
  });
});
