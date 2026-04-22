import type { Authenticator } from "@app/lib/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetLlmCredentials = vi.hoisted(() => vi.fn());
const mockIsProviderWhitelisted = vi.hoisted(() => vi.fn());
const mockGoogleImageGenerationLLM = vi.hoisted(() => vi.fn());
const mockOpenAIImageGenerationLLM = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: mockGetLlmCredentials,
}));

vi.mock("@app/lib/assistant", () => ({
  isProviderWhitelisted: mockIsProviderWhitelisted,
}));

vi.mock("@app/lib/api/llm/clients/google/imageGeneration", () => ({
  ImageGenerationGoogleLLM: mockGoogleImageGenerationLLM,
}));

vi.mock("@app/lib/api/llm/clients/openai/imageGeneration", () => ({
  ImageGenerationOpenAILLM: mockOpenAIImageGenerationLLM,
}));

import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { GPT_IMAGE_2_MODEL_ID } from "@app/types/assistant/models/openai";

import { getImageGenerationLLM } from "./getImageGenerationLLM";

const CREDENTIALS = {
  GOOGLE_AI_STUDIO_API_KEY: "test-google-key",
  OPENAI_API_KEY: "test-openai-key",
};

const auth = {} as Authenticator;

describe("getImageGenerationLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetLlmCredentials.mockResolvedValue(CREDENTIALS);
    mockIsProviderWhitelisted.mockReturnValue(false);

    mockGoogleImageGenerationLLM.mockImplementation(function (_auth, args) {
      return { provider: "google", args };
    });
    mockOpenAIImageGenerationLLM.mockImplementation(function (_auth, args) {
      return { provider: "openai", args };
    });
  });

  it("returns OpenAI gpt-image-2 when openai is whitelisted", async () => {
    mockIsProviderWhitelisted.mockImplementation(
      (_auth, providerId) => providerId === "openai"
    );

    const llm = await getImageGenerationLLM(auth);

    expect(mockOpenAIImageGenerationLLM).toHaveBeenCalledWith(auth, {
      modelId: GPT_IMAGE_2_MODEL_ID,
      credentials: CREDENTIALS,
    });
    expect(mockGoogleImageGenerationLLM).not.toHaveBeenCalled();
    expect(llm).toEqual({
      provider: "openai",
      args: { modelId: GPT_IMAGE_2_MODEL_ID, credentials: CREDENTIALS },
    });
  });

  it("prefers OpenAI over Gemini when both providers are whitelisted", async () => {
    mockIsProviderWhitelisted.mockReturnValue(true);

    const llm = await getImageGenerationLLM(auth);

    expect(mockOpenAIImageGenerationLLM).toHaveBeenCalledWith(auth, {
      modelId: GPT_IMAGE_2_MODEL_ID,
      credentials: CREDENTIALS,
    });
    expect(mockGoogleImageGenerationLLM).not.toHaveBeenCalled();
    expect(llm).toEqual({
      provider: "openai",
      args: { modelId: GPT_IMAGE_2_MODEL_ID, credentials: CREDENTIALS },
    });
  });

  it("falls back to Gemini when openai is not whitelisted", async () => {
    mockIsProviderWhitelisted.mockImplementation(
      (_auth, providerId) => providerId === "google_ai_studio"
    );

    const llm = await getImageGenerationLLM(auth);

    expect(mockGoogleImageGenerationLLM).toHaveBeenCalledWith(auth, {
      modelId: GEMINI_3_PRO_IMAGE_MODEL_ID,
      credentials: CREDENTIALS,
    });
    expect(mockOpenAIImageGenerationLLM).not.toHaveBeenCalled();
    expect(llm).toEqual({
      provider: "google",
      args: { modelId: GEMINI_3_PRO_IMAGE_MODEL_ID, credentials: CREDENTIALS },
    });
  });

  it("returns null when neither openai nor google is whitelisted", async () => {
    const llm = await getImageGenerationLLM(auth);

    expect(llm).toBeNull();
    expect(mockOpenAIImageGenerationLLM).not.toHaveBeenCalled();
    expect(mockGoogleImageGenerationLLM).not.toHaveBeenCalled();
  });
});
