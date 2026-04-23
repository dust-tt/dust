import { SubscriptionModel } from "@app/lib/models/plan";
import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetLlmCredentials = vi.hoisted(() => vi.fn());
const mockIsProviderWhitelisted = vi.hoisted(() => vi.fn());
const mockGoogleImageGenerationLLM = vi.hoisted(() => vi.fn());
const mockOpenAIImageGenerationLLM = vi.hoisted(() => vi.fn());
const mockGetCurrentRegion = vi.hoisted(() => vi.fn());

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

vi.mock("@app/lib/api/regions/config", () => ({
  config: {
    getCurrentRegion: mockGetCurrentRegion,
  },
}));

import { Authenticator } from "@app/lib/auth";
import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { GPT_IMAGE_2_MODEL_ID } from "@app/types/assistant/models/openai";

import { getImageGenerationLLM } from "./getImageGenerationLLM";

const CREDENTIALS = {
  GOOGLE_AI_STUDIO_API_KEY: "test-google-key",
  OPENAI_API_KEY: "test-openai-key",
};

function makeAuth(): Authenticator {
  const plan = renderPlanFromModel({
    plan: {
      ...FREE_NO_PLAN_DATA,
      code: "FREE_TEST",
      name: "Free",
      maxMessages: 50,
      maxImagesPerWeek: 50,
      maxUsersInWorkspace: 1,
      maxVaultsInWorkspace: 1,
      maxDataSourcesCount: 5,
      maxDataSourcesDocumentsCount: 10,
      maxDataSourcesDocumentsSizeMb: 2,
      canUseProduct: true,
      isByok: false,
    },
  });

  const subscription = new SubscriptionResource(
    SubscriptionModel,
    {
      id: -1,
      sId: "test-subscription",
      status: "active",
      trialing: null,
      paymentFailingSince: null,
      startDate: new Date(),
      endDate: null,
      planId: -1,
      stripeSubscriptionId: null,
      metronomeContractId: null,
      requestCancelAt: null,
      workspaceId: -1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    plan
  );

  return new Authenticator({
    workspace: null,
    user: null,
    role: "none",
    groupModelIds: [],
    subscription,
    authMethod: "internal",
  });
}

describe("getImageGenerationLLM", () => {
  let auth: Authenticator;

  beforeEach(() => {
    vi.clearAllMocks();

    auth = makeAuth();

    mockGetLlmCredentials.mockResolvedValue(CREDENTIALS);
    mockIsProviderWhitelisted.mockReturnValue(false);
    mockGetCurrentRegion.mockReturnValue("us-central1");

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

  it("falls back to Gemini in the EU region even when openai is whitelisted", async () => {
    mockGetCurrentRegion.mockReturnValue("europe-west1");
    mockIsProviderWhitelisted.mockReturnValue(true);

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

  it("returns null in the EU region when only openai is whitelisted", async () => {
    mockGetCurrentRegion.mockReturnValue("europe-west1");
    mockIsProviderWhitelisted.mockImplementation(
      (_auth, providerId) => providerId === "openai"
    );

    const llm = await getImageGenerationLLM(auth);

    expect(llm).toBeNull();
    expect(mockOpenAIImageGenerationLLM).not.toHaveBeenCalled();
    expect(mockGoogleImageGenerationLLM).not.toHaveBeenCalled();
  });
});
