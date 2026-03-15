import { getLlmCredentials } from "@app/lib/api/provider_credentials";
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

describe("getLlmCredentials", () => {
  beforeEach(() => {
    mockGetCredentials.mockResolvedValue(
      new Ok({ credential: { content: { api_key: "sk-test" } } })
    );
  });

  it("returns Dust-managed LLM credentials for non-BYOK workspaces", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const result = await getLlmCredentials(authenticator);

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

    const result = await getLlmCredentials(authenticator);

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

    const result = await getLlmCredentials(authenticator);

    expect(result).toEqual({});
  });

  describe("requireEmbeddingApiKey", () => {
    it("does not throw for non-BYOK workspaces even without embedding key", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const result = await getLlmCredentials(authenticator, {
        requireEmbeddingApiKey: true,
      });

      expect(result.OPENAI_EMBEDDING_API_KEY).toBeUndefined();
    });

    it("does not throw for BYOK workspace when OpenAI credentials are configured", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "openai");

      const result = await getLlmCredentials(authenticator, {
        requireEmbeddingApiKey: true,
      });

      expect(result.OPENAI_EMBEDDING_API_KEY).toBe("sk-test");
    });

    it("throws for BYOK workspace when OpenAI credentials are not configured", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });

      await expect(
        getLlmCredentials(authenticator, { requireEmbeddingApiKey: true })
      ).rejects.toThrow(
        "[BYOK] This action requires OPENAI_EMBEDDING_API_KEY to be configured."
      );
    });

    it("throws for BYOK workspace when only non-OpenAI credentials are configured", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });
      const workspace = authenticator.getNonNullableWorkspace();

      await ProviderCredentialFactory.basic(workspace, "anthropic");

      await expect(
        getLlmCredentials(authenticator, { requireEmbeddingApiKey: true })
      ).rejects.toThrow(
        "[BYOK] This action requires OPENAI_EMBEDDING_API_KEY to be configured."
      );
    });

    it("does not throw for BYOK workspace without the flag", async () => {
      const { authenticator } = await createResourceTest({
        role: "admin",
        isByok: true,
      });

      const result = await getLlmCredentials(authenticator);

      expect(result).toEqual({});
    });
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

    await expect(getLlmCredentials(authenticator)).rejects.toThrow(
      "Failed to fetch OAuth credentials for provider openai"
    );
  });
});
