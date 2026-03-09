import { Authenticator } from "@app/lib/auth";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { ProviderCredentialFactory } from "@app/tests/utils/ProviderCredentialFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Enable isByok on the workspace's plan and return a fresh authenticator
 * that reflects the updated plan.
 *
 * Uses SubscriptionModel/PlanModel directly: SubscriptionResource goes through
 * Redis cache which drops planId, and no PlanResource exists for plan mutations.
 */
async function enableByokAndRefreshAuth(
  workspace: LightWorkspaceType,
  userId: string
): Promise<Authenticator> {
  const subscription = await SubscriptionModel.findOne({
    where: { workspaceId: workspace.id, status: "active" },
  });
  if (!subscription) {
    throw new Error("No active subscription found");
  }
  await PlanModel.update(
    { isByok: true },
    { where: { id: subscription.planId } }
  );

  // Re-create authenticator so it picks up the updated plan.
  return Authenticator.fromUserIdAndWorkspaceId(userId, workspace.sId);
}

describe("ProviderCredentialResource", () => {
  let auth: Authenticator;
  let userId: string;

  beforeEach(async () => {
    const testSetup = await createResourceTest({ role: "admin" });
    auth = testSetup.authenticator;
    userId = testSetup.user.sId;
  });

  describe("listByWorkspace", () => {
    it("throws when plan does not have isByok enabled", async () => {
      await expect(
        ProviderCredentialResource.listByWorkspace(auth)
      ).rejects.toThrow("BYOK is not enabled");
    });

    it("returns empty array when no credentials exist", async () => {
      const workspace = auth.getNonNullableWorkspace();
      auth = await enableByokAndRefreshAuth(workspace, userId);

      const credentials =
        await ProviderCredentialResource.listByWorkspace(auth);

      expect(credentials).toEqual([]);
    });

    it("returns all credentials for the workspace", async () => {
      const workspace = auth.getNonNullableWorkspace();
      auth = await enableByokAndRefreshAuth(workspace, userId);

      await ProviderCredentialFactory.basic(workspace, "openai");
      await ProviderCredentialFactory.basic(workspace, "anthropic");

      const credentials =
        await ProviderCredentialResource.listByWorkspace(auth);

      expect(credentials).toHaveLength(2);
      expect(credentials.map((c) => c.providerId).sort()).toEqual([
        "anthropic",
        "openai",
      ]);
    });
  });

  describe("toJSON", () => {
    it("returns a valid ProviderCredentialType", async () => {
      const workspace = auth.getNonNullableWorkspace();
      auth = await enableByokAndRefreshAuth(workspace, userId);
      await ProviderCredentialFactory.basic(workspace, "openai");

      const [credential] =
        await ProviderCredentialResource.listByWorkspace(auth);

      const json = credential.toJSON();

      expect(json.sId).toMatch(/^pcr_/);
      expect(json.providerId).toBe("openai");
      expect(json.credentialId).toBe("cred-openai");
      expect(json.isHealthy).toBe(true);
      expect(json.placeholder).toBe("sk-...abc");
      expect(json.editedByUserId).toBeNull();
      expect(typeof json.createdAt).toBe("number");
      expect(typeof json.updatedAt).toBe("number");
    });
  });

  describe("delete", () => {
    it("removes the credential", async () => {
      const workspace = auth.getNonNullableWorkspace();
      auth = await enableByokAndRefreshAuth(workspace, userId);
      await ProviderCredentialFactory.basic(workspace, "openai");

      const [credential] =
        await ProviderCredentialResource.listByWorkspace(auth);
      await credential.delete(auth);

      const remaining = await ProviderCredentialResource.listByWorkspace(auth);
      expect(remaining).toHaveLength(0);
    });
  });

  describe("deleteAllForWorkspace", () => {
    it("removes all credentials for the workspace", async () => {
      const workspace = auth.getNonNullableWorkspace();
      auth = await enableByokAndRefreshAuth(workspace, userId);

      await ProviderCredentialFactory.basic(workspace, "openai");
      await ProviderCredentialFactory.basic(workspace, "anthropic");

      await ProviderCredentialResource.deleteAllForWorkspace(auth);

      const remaining = await ProviderCredentialResource.listByWorkspace(auth);
      expect(remaining).toHaveLength(0);
    });
  });
});
