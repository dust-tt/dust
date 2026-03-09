import type { Authenticator } from "@app/lib/auth";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { ProviderCredentialFactory } from "@app/tests/utils/ProviderCredentialFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("ProviderCredentialResource", () => {
  describe("listByWorkspace", () => {
    it("throws when plan does not have isByok enabled", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      await expect(
        ProviderCredentialResource.listByWorkspace(authenticator)
      ).rejects.toThrow("BYOK is not enabled");
    });

    it("returns empty array when no credentials exist", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });

      const credentials =
        await ProviderCredentialResource.listByWorkspace(authenticator);

      expect(credentials).toEqual([]);
    });

    it("returns all credentials for the workspace", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "openai");
      await ProviderCredentialFactory.basic(workspace, "anthropic");

      const credentials =
        await ProviderCredentialResource.listByWorkspace(authenticator);

      expect(credentials).toHaveLength(2);
      expect(credentials.map((c) => c.providerId).sort()).toEqual([
        "anthropic",
        "openai",
      ]);
    });
  });

  describe("toJSON", () => {
    it("returns a valid ProviderCredentialType", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();
      await ProviderCredentialFactory.basic(workspace, "openai");

      const [credential] =
        await ProviderCredentialResource.listByWorkspace(authenticator);

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
    let auth: Authenticator;
    let workspace: LightWorkspaceType;

    beforeEach(async () => {
      const testSetup = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      auth = testSetup.authenticator;
      workspace = auth.getNonNullableWorkspace();
    });

    it("removes the credential", async () => {
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
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "openai");
      await ProviderCredentialFactory.basic(workspace, "anthropic");

      await ProviderCredentialResource.deleteAllForWorkspace(authenticator);

      const remaining =
        await ProviderCredentialResource.listByWorkspace(authenticator);
      expect(remaining).toHaveLength(0);
    });
  });
});
