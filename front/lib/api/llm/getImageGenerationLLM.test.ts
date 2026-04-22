import { SubscriptionModel } from "@app/lib/models/plan";
import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import { FREE_BYOK_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetLlmCredentials = vi.hoisted(() => vi.fn());
const mockIsProviderWhitelisted = vi.hoisted(() => vi.fn());
const mockGetFeatureFlags = vi.hoisted(() => vi.fn());
const mockGoogleImageGenerationLLM = vi.hoisted(() => vi.fn());
const mockOpenAIImageGenerationLLM = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: mockGetLlmCredentials,
}));

vi.mock("@app/lib/assistant", () => ({
  isProviderWhitelisted: mockIsProviderWhitelisted,
}));

vi.mock("@app/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/auth")>();
  return {
    ...actual,
    getFeatureFlags: mockGetFeatureFlags,
  };
});

vi.mock("@app/lib/api/llm/clients/google/imageGeneration", () => ({
  ImageGenerationGoogleLLM: mockGoogleImageGenerationLLM,
}));

vi.mock("@app/lib/api/llm/clients/openai/imageGeneration", () => ({
  ImageGenerationOpenAILLM: mockOpenAIImageGenerationLLM,
}));

import { Authenticator } from "@app/lib/auth";
import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { GPT_IMAGE_2_MODEL_ID } from "@app/types/assistant/models/openai";
import { getImageGenerationLLM } from "./getImageGenerationLLM";

describe("getImageGenerationLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetLlmCredentials.mockResolvedValue({
      GOOGLE_AI_STUDIO_API_KEY: "test-google-key",
      OPENAI_API_KEY: "test-openai-key",
    });
    mockGetFeatureFlags.mockResolvedValue([]);
    mockIsProviderWhitelisted.mockReturnValue(false);

    mockGoogleImageGenerationLLM.mockImplementation(function (_auth, args) {
      return { provider: "google", args };
    });
    mockOpenAIImageGenerationLLM.mockImplementation(function (_auth, args) {
      return { provider: "openai", args };
    });
  });

  it("returns OpenAI gpt-image-2 when the feature flag is enabled", async () => {
    mockGetFeatureFlags.mockResolvedValue(["gpt_image_2_feature"]);

    const auth = makeAuth({ isByok: false });

    const llm = await getImageGenerationLLM(auth);

    expect(mockOpenAIImageGenerationLLM).toHaveBeenCalledWith(auth, {
      modelId: GPT_IMAGE_2_MODEL_ID,
      credentials: {
        GOOGLE_AI_STUDIO_API_KEY: "test-google-key",
        OPENAI_API_KEY: "test-openai-key",
      },
    });
    expect(llm).toEqual({
      provider: "openai",
      args: {
        modelId: GPT_IMAGE_2_MODEL_ID,
        credentials: {
          GOOGLE_AI_STUDIO_API_KEY: "test-google-key",
          OPENAI_API_KEY: "test-openai-key",
        },
      },
    });
  });

  it("returns Gemini for unflagged workspaces on the Google route", async () => {
    const auth = makeAuth({ isByok: false });

    const llm = await getImageGenerationLLM(auth);

    expect(mockGoogleImageGenerationLLM).toHaveBeenCalledWith(auth, {
      modelId: GEMINI_3_PRO_IMAGE_MODEL_ID,
      credentials: {
        GOOGLE_AI_STUDIO_API_KEY: "test-google-key",
        OPENAI_API_KEY: "test-openai-key",
      },
    });
    expect(llm).toEqual({
      provider: "google",
      args: {
        modelId: GEMINI_3_PRO_IMAGE_MODEL_ID,
        credentials: {
          GOOGLE_AI_STUDIO_API_KEY: "test-google-key",
          OPENAI_API_KEY: "test-openai-key",
        },
      },
    });
  });

  it("returns OpenAI gpt-image-2 for unflagged workspaces on the OpenAI route", async () => {
    mockIsProviderWhitelisted.mockImplementation((_auth, providerId) => {
      return providerId === "openai";
    });

    const auth = makeAuth({ isByok: true });

    const llm = await getImageGenerationLLM(auth);

    expect(mockOpenAIImageGenerationLLM).toHaveBeenCalledWith(auth, {
      modelId: GPT_IMAGE_2_MODEL_ID,
      credentials: {
        GOOGLE_AI_STUDIO_API_KEY: "test-google-key",
        OPENAI_API_KEY: "test-openai-key",
      },
    });
    expect(llm).toEqual({
      provider: "openai",
      args: {
        modelId: GPT_IMAGE_2_MODEL_ID,
        credentials: {
          GOOGLE_AI_STUDIO_API_KEY: "test-google-key",
          OPENAI_API_KEY: "test-openai-key",
        },
      },
    });
  });

  it("returns null when no image generation provider is available", async () => {
    const auth = makeAuth({ isByok: true });

    const llm = await getImageGenerationLLM(auth);

    expect(llm).toBeNull();
  });
});

function makeAuth({ isByok }: { isByok: boolean }) {
  const plan = renderPlanFromModel({
    plan: isByok
      ? {
          ...FREE_NO_PLAN_DATA,
          code: FREE_BYOK_PLAN_CODE,
          name: "Free (BYOK)",
          maxMessages: -1,
          maxImagesPerWeek: 50,
          maxUsersInWorkspace: -1,
          maxVaultsInWorkspace: -1,
          isSlackbotAllowed: true,
          isManagedConfluenceAllowed: true,
          isManagedSlackAllowed: true,
          isManagedNotionAllowed: true,
          isManagedGoogleDriveAllowed: true,
          isManagedGithubAllowed: true,
          isManagedIntercomAllowed: true,
          isManagedWebCrawlerAllowed: true,
          isManagedSalesforceAllowed: true,
          isSSOAllowed: true,
          maxDataSourcesCount: -1,
          maxDataSourcesDocumentsCount: -1,
          canUseProduct: true,
          isByok: true,
        }
      : {
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
