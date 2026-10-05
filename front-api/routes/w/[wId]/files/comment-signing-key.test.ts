import { generateKeyPairSync } from "node:crypto";
import config from "@app/lib/api/config";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("GET /api/w/:wId/files/comment-signing-key", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the public key matching the signing key", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    vi.spyOn(config, "getDfmCommentSigningKey").mockReturnValue(
      privateKey.export({ format: "der", type: "pkcs8" }).toString("base64")
    );
    const { workspace } = await createPrivateApiMockRequest();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/files/comment-signing-key`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      publicKey: publicKey
        .export({ format: "der", type: "spki" })
        .toString("base64url"),
    });
  });

  it("returns null without a signing key", async () => {
    vi.spyOn(config, "getDfmCommentSigningKey").mockReturnValue(undefined);
    const { workspace } = await createPrivateApiMockRequest();

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/files/comment-signing-key`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publicKey: null });
  });
});
