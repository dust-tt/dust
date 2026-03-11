import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { ProviderCredentialFactory } from "@app/tests/utils/ProviderCredentialFactory";
import { dustManagedLLMCredentials } from "@app/types/api/credentials";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

const mockGetCredentials = vi.fn();

vi.mock("@app/types/oauth/oauth_api", async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return {
    ...actual,
    OAuthAPI: vi.fn().mockImplementation(function () {
      return {
        getCredentials: mockGetCredentials,
      };
    }),
  };
});

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
    it("removes the credential", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "openai");

      const [credential] =
        await ProviderCredentialResource.listByWorkspace(authenticator);
      await credential.delete(authenticator);

      const remaining =
        await ProviderCredentialResource.listByWorkspace(authenticator);
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

  describe("getCredentials", () => {
    it("returns dustManagedLLMCredentials for non-BYOK workspaces", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const credentials =
        await ProviderCredentialResource.getCredentials(authenticator);

      expect(credentials).toEqual(dustManagedLLMCredentials());
    });

    it("returns mapped credentials for BYOK workspace with multiple providers", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "openai");
      await ProviderCredentialFactory.basic(workspace, "anthropic");

      mockGetCredentials.mockImplementation(
        ({ credentialsId }: { credentialsId: string }) => {
          if (credentialsId === "cred-openai") {
            return new Ok({
              credential: {
                content: {
                  api_key: "sk-openai-test",
                  base_url: "https://custom.openai.com",
                },
              },
            });
          }
          if (credentialsId === "cred-anthropic") {
            return new Ok({
              credential: { content: { api_key: "sk-anthropic-test" } },
            });
          }
          throw new Error(`Unexpected credentialsId: ${credentialsId}`);
        }
      );

      const credentials =
        await ProviderCredentialResource.getCredentials(authenticator);

      expect(credentials).toEqual({
        OPENAI_API_KEY: "sk-openai-test",
        OPENAI_BASE_URL: "https://custom.openai.com",
        ANTHROPIC_API_KEY: "sk-anthropic-test",
        OPENAI_USE_EU_ENDPOINT: "false",
      });
    });

    it("returns empty credentials for BYOK workspace with no providers", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });

      const credentials =
        await ProviderCredentialResource.getCredentials(authenticator);

      expect(credentials).toEqual({});
    });

    it("throws when OAuth fetch fails for a provider", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "openai");

      mockGetCredentials.mockResolvedValue({
        isErr: () => true,
        error: { message: "OAuth service unavailable" },
      });

      await expect(
        ProviderCredentialResource.getCredentials(authenticator)
      ).rejects.toThrow(
        "Failed to fetch OAuth credentials for provider openai"
      );
    });
  });
});
