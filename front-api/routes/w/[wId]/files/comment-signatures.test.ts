import { generateKeyPairSync, verify } from "node:crypto";
import config from "@app/lib/api/config";
import { messageSignaturePayload } from "@app/lib/markdown/dfm";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
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

describe("POST /api/w/:wId/files/comment-signatures", () => {
  const post = (workspaceId: string, body: object) =>
    honoApp.request(url(workspaceId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("writes and signs the message as the signed-in user", async () => {
    const { workspace, auth, user } = await createPrivateApiMockRequest();
    await FeatureFlagFactory.basic(auth, "co_edition");

    const response = await post(workspace.sId, {
      commentId: "c1",
      body: "Looks good.",
      author: { kind: "user", id: "usr_other", name: "Not me" },
    });

    expect(response.status).toBe(200);
    const { message } = await response.json();
    expect(message.author).toEqual({
      kind: "user",
      id: user.sId,
      name: user.fullName(),
    });
    expect(message.body).toBe("Looks good.");
    expect(
      verify(
        null,
        Buffer.from(
          messageSignaturePayload({
            workspaceId: workspace.sId,
            commentId: "c1",
            message,
          }),
          "utf8"
        ),
        publicKey,
        Buffer.from(message.signature, "base64url")
      )
    ).toBe(true);
  });

  it("refuses without co_edition", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await post(workspace.sId, {
      commentId: "c1",
      body: "Looks good.",
    });

    expect(response.status).toBe(403);
  });

  it("refuses a message the codec cannot write", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest();
    await FeatureFlagFactory.basic(auth, "co_edition");

    const response = await post(workspace.sId, {
      commentId: "c1",
      body: "::message{}",
    });

    expect(response.status).toBe(400);
  });
});
