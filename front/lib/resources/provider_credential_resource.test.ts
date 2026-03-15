import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { ProviderCredentialResource } from "@app/lib/resources/provider_credential_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { ProviderCredentialFactory } from "@app/tests/utils/ProviderCredentialFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    mockGetCredentials.mockResolvedValue(
      new Ok({ credential: { content: { api_key: "sk-test" } } })
    );
  });

  describe("listByWorkspace", () => {
    it("throws when plan does not have isByok enabled", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      await expect(
        ProviderCredentialResource.listByWorkspace(authenticator)
      ).rejects.toThrow("BYOK must be enabled");
    });

    it("returns empty array when no credentials exist", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });

      const result =
        await ProviderCredentialResource.listByWorkspace(authenticator);

      expect(result).toEqual([]);
    });

    it("returns all credentials for the workspace", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "openai");
      await ProviderCredentialFactory.basic(workspace, "anthropic");

      const result =
        await ProviderCredentialResource.listByWorkspace(authenticator);

      expect(result).toHaveLength(2);
      expect(result.map((c) => c.providerId).sort()).toEqual([
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

      const result =
        await ProviderCredentialResource.listByWorkspace(authenticator);

      const [credential] = result;
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

      const result =
        await ProviderCredentialResource.listByWorkspace(authenticator);

      const [credential] = result;
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
    it("returns Dust-managed LLM credentials for non-BYOK workspaces", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const result =
        await getLlmCredentials(authenticator);

      expect(result).toEqual({
        ANTHROPIC_API_KEY: "",
        AZURE_OPENAI_API_KEY: "",
        AZURE_OPENAI_ENDPOINT: "",
        MISTRAL_API_KEY: "",
        OPENAI_API_KEY: "",
        OPENAI_BASE_URL: "",
        OPENAI_USE_EU_ENDPOINT: "false",
        TEXTSYNTH_API_KEY: "",
        GOOGLE_AI_STUDIO_API_KEY: "",
        TOGETHERAI_API_KEY: "",
        DEEPSEEK_API_KEY: "",
        FIREWORKS_API_KEY: "",
        XAI_API_KEY: "",
      });
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
              credential: { content: { api_key: "sk-openai-test" } },
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

      const result =
        await getLlmCredentials(authenticator);

      expect(result).toEqual({
        OPENAI_API_KEY: "sk-openai-test",
        OPENAI_EMBEDDING_API_KEY: "sk-openai-test",
        ANTHROPIC_API_KEY: "sk-anthropic-test",
      });
    });

    it("returns empty credentials for BYOK workspace with no providers", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });

      const result =
        await getLlmCredentials(authenticator);

      expect(result).toEqual({});
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
        getLlmCredentials(authenticator)
      ).rejects.toThrow(
        "Failed to fetch OAuth credentials for provider openai"
      );
    });
  });
});
