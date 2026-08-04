import { NotionWebhookRegistrationModel } from "@connectors/lib/models/notion_webhook_registration";
import {
  issueNotionWebhookRegistration,
  redeemNotionWebhookRegistration,
} from "@connectors/lib/notion_webhook_registration";
import { describe, expect, it, vi } from "vitest";

const notionWorkspaceId = "notion-workspace-id";
const issuedAt = new Date("2026-07-29T12:00:00.000Z");

describe("Notion webhook registration", () => {
  it("stores only a hash of the registration code", async () => {
    const { registrationToken } = await issueNotionWebhookRegistration({
      notionWorkspaceId,
      now: issuedAt,
    });

    const registration = await NotionWebhookRegistrationModel.findOne({
      where: { notionWorkspaceId },
    });

    expect(registration).not.toBeNull();
    expect(registration?.tokenHash).not.toBe(registrationToken);
    expect(registration?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("invalidates an earlier code when a new code is issued", async () => {
    const first = await issueNotionWebhookRegistration({
      notionWorkspaceId,
      now: issuedAt,
    });
    const second = await issueNotionWebhookRegistration({
      notionWorkspaceId,
      now: issuedAt,
    });
    const storeSigningSecret = vi.fn(async () => {});

    const firstResult = await redeemNotionWebhookRegistration({
      notionWorkspaceId,
      now: issuedAt,
      registrationToken: first.registrationToken,
      signingSecret: "notion-signing-secret",
      storeSigningSecret,
    });
    expect(firstResult.isErr()).toBe(true);
    if (firstResult.isErr()) {
      expect(firstResult.error.code).toBe("invalid");
    }

    const secondResult = await redeemNotionWebhookRegistration({
      notionWorkspaceId,
      now: issuedAt,
      registrationToken: second.registrationToken,
      signingSecret: "notion-signing-secret",
      storeSigningSecret,
    });
    expect(secondResult.isOk()).toBe(true);
    if (secondResult.isOk()) {
      expect(secondResult.value).toEqual({ alreadyRedeemed: false });
    }
    expect(storeSigningSecret).toHaveBeenCalledTimes(1);
  });

  it("accepts an identical retry without storing the secret twice", async () => {
    const { registrationToken } = await issueNotionWebhookRegistration({
      notionWorkspaceId,
      now: issuedAt,
    });
    const firstStore = vi.fn(async () => {});
    const retryStore = vi.fn(async () => {});

    const firstResult = await redeemNotionWebhookRegistration({
      notionWorkspaceId,
      now: issuedAt,
      registrationToken,
      signingSecret: "notion-signing-secret",
      storeSigningSecret: firstStore,
    });
    expect(firstResult.isOk()).toBe(true);
    if (firstResult.isOk()) {
      expect(firstResult.value).toEqual({ alreadyRedeemed: false });
    }

    const retryResult = await redeemNotionWebhookRegistration({
      notionWorkspaceId,
      now: issuedAt,
      registrationToken,
      signingSecret: "notion-signing-secret",
      storeSigningSecret: retryStore,
    });
    expect(retryResult.isOk()).toBe(true);
    if (retryResult.isOk()) {
      expect(retryResult.value).toEqual({ alreadyRedeemed: true });
    }
    expect(firstStore).toHaveBeenCalledTimes(1);
    expect(retryStore).not.toHaveBeenCalled();
  });

  it("rejects reuse with a different signing secret", async () => {
    const { registrationToken } = await issueNotionWebhookRegistration({
      notionWorkspaceId,
      now: issuedAt,
    });

    await redeemNotionWebhookRegistration({
      notionWorkspaceId,
      now: issuedAt,
      registrationToken,
      signingSecret: "first-signing-secret",
      storeSigningSecret: vi.fn(async () => {}),
    });
    const secondStore = vi.fn(async () => {});

    const secondResult = await redeemNotionWebhookRegistration({
      notionWorkspaceId,
      now: issuedAt,
      registrationToken,
      signingSecret: "different-signing-secret",
      storeSigningSecret: secondStore,
    });
    expect(secondResult.isErr()).toBe(true);
    if (secondResult.isErr()) {
      expect(secondResult.error.code).toBe("used_with_different_secret");
    }
    expect(secondStore).not.toHaveBeenCalled();
  });

  it("rejects an expired code", async () => {
    const { registrationToken } = await issueNotionWebhookRegistration({
      notionWorkspaceId,
      now: issuedAt,
    });
    const storeSigningSecret = vi.fn(async () => {});

    const result = await redeemNotionWebhookRegistration({
      notionWorkspaceId,
      now: new Date(issuedAt.getTime() + 16 * 60 * 1000),
      registrationToken,
      signingSecret: "notion-signing-secret",
      storeSigningSecret,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("expired");
    }
    expect(storeSigningSecret).not.toHaveBeenCalled();
  });
});
