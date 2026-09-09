import { getModelConfigForWebSummarization } from "@app/lib/actions/mcp_internal_actions/utils/web_summarization";
import { getEffectiveWhiteListedProviders } from "@app/lib/api/assistant/models";
import { getSmallWhitelistedModel } from "@app/lib/api/assistant/models";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { GPT_5_6_LUNA_MODEL_ID } from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

describe("getModelConfigForWebSummarization", () => {
  it("uses GPT 5.6 Luna with light reasoning when OpenAI is available", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["openai"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const featureFlags = await getFeatureFlags(auth);

    expect(getModelConfigForWebSummarization(
        auth,
        featureFlags,
        await getEffectiveWhiteListedProviders(auth)
      )).toMatchObject(
      {
        modelConfiguration: {
          providerId: "openai",
          modelId: GPT_5_6_LUNA_MODEL_ID,
        },
        reasoningEffort: "light",
      }
    );
  });

  it("falls back to the preferred available small model", async () => {
    const workspace = await WorkspaceFactory.basic({
      whiteListedProviders: ["anthropic"],
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const featureFlags = await getFeatureFlags(auth);
    const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);
    const smallModel = getSmallWhitelistedModel(auth, new Set(), {
      featureFlags,
      whiteListedProviders,
    });

    expect(smallModel).not.toBeNull();
    expect(getModelConfigForWebSummarization(
        auth,
        featureFlags,
        await getEffectiveWhiteListedProviders(auth)
      )).toEqual({
      modelConfiguration: smallModel,
      reasoningEffort: smallModel?.defaultReasoningEffort,
    });
  });
});
