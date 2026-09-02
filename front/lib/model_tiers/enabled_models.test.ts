import { Authenticator } from "@app/lib/auth";
import { setUserMaxAllowedTier } from "@app/lib/model_tiers/allowed_tiers";
import {
  getDefaultModelFromEnabledModels,
  getEnabledModelsForAuth,
  getModelsForAuth,
  resolveStreamModel,
  withModelSelectability,
} from "@app/lib/model_tiers/enabled_models";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import {
  CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
  CLAUDE_OPUS_5_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import {
  AUTO_COMPLEX_MODEL_CONFIG,
  AUTO_FAST_MODEL_CONFIG,
  AUTO_MODEL_CONFIG,
  MODEL_STREAMS,
} from "@app/types/assistant/models/auto";
import { FIREWORKS_GLM_5P2_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";
import { GPT_5_6_LUNA_MODEL_ID } from "@app/types/assistant/models/openai";
import type { ModelIdType } from "@app/types/assistant/models/types";
import { beforeEach, describe, expect, it } from "vitest";

const CUSTOM_MODEL_CONFIG = {
  ...CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
  // unsafe "as", because those are generated at runtime.
  modelId: "my-custom-model-from-eap" as ModelIdType,
};

describe("withModelSelectability", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    adminAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  async function userAuthForTierCap(tierName: "cost_efficient" | "balanced") {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await setUserMaxAllowedTier(adminAuth, {
      userId: user.sId,
      tierName,
    });

    return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
  }

  it("keeps full reasoning efforts when the user has no tier cap", async () => {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const [model] = await withModelSelectability(auth, {
      models: [CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG],
    });

    expect(model.isSelectable).toBe(true);
    expect(model.supportedReasoningEfforts).toEqual(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.supportedReasoningEfforts
    );
    expect(model.defaultReasoningEffort).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.defaultReasoningEffort
    );
  });

  it("filters reasoning efforts to those allowed by the user's tier cap", async () => {
    const auth = await userAuthForTierCap("cost_efficient");

    const [model] = await withModelSelectability(auth, {
      models: [CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG],
    });

    expect(model.isSelectable).toBe(true);
    expect(model.supportedReasoningEfforts).toEqual({
      none: false,
      light: true,
      medium: false,
      high: false,
    });
    expect(model.defaultReasoningEffort).toBe("light");
  });

  it("keeps reasoning efforts up to the user's tier cap and drops premium ones", async () => {
    const auth = await userAuthForTierCap("balanced");

    const [model] = await withModelSelectability(auth, {
      models: [CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG],
    });

    // Under a balanced cap, Sonnet 4.6's light (cost_efficient) and medium
    // (balanced) efforts remain, but high (premium) is dropped.
    expect(model.isSelectable).toBe(true);
    expect(model.supportedReasoningEfforts).toEqual({
      none: false,
      light: true,
      medium: true,
      high: false,
    });
    expect(model.defaultReasoningEffort).toBe("medium");
  });

  it("reports tier-capped efforts as unavailable in the models response", async () => {
    const auth = await userAuthForTierCap("balanced");

    const { models } = await getModelsForAuth(auth);
    const sonnet = models.find(
      (model) =>
        model.modelId === CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );

    expect(sonnet?.selectionAvailability?.reasoningEfforts).toEqual([
      { effort: "light", unavailabilityReason: null },
      { effort: "medium", unavailabilityReason: null },
      { effort: "high", unavailabilityReason: "model_access" },
    ]);
  });

  it("marks frontier-only models as not selectable when capped at balanced", async () => {
    const auth = await userAuthForTierCap("balanced");

    const [model] = await withModelSelectability(auth, {
      models: [CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG],
    });

    expect(model.isSelectable).toBe(false);
    expect(model.supportedReasoningEfforts).toEqual({
      none: false,
      light: false,
      medium: false,
      high: false,
    });
  });

  it("gates each stream on the tier it is named after", async () => {
    const auth = await userAuthForTierCap("balanced");

    const models = await withModelSelectability(auth, {
      models: [
        AUTO_FAST_MODEL_CONFIG,
        AUTO_MODEL_CONFIG,
        AUTO_COMPLEX_MODEL_CONFIG,
      ],
    });

    // Under a balanced cap the Basic and Standard streams stay selectable, but
    // the Premium stream is out of reach.
    expect(models.map((m) => [m.modelId, m.isSelectable])).toEqual([
      [AUTO_FAST_MODEL_CONFIG.modelId, true],
      [AUTO_MODEL_CONFIG.modelId, true],
      [AUTO_COMPLEX_MODEL_CONFIG.modelId, false],
    ]);
  });

  it("defaults a Basic-capped member to the Basic stream", async () => {
    const auth = await userAuthForTierCap("cost_efficient");

    const models = await withModelSelectability(auth, {
      models: [
        CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
        AUTO_FAST_MODEL_CONFIG,
        AUTO_MODEL_CONFIG,
        AUTO_COMPLEX_MODEL_CONFIG,
      ],
    });

    expect(getDefaultModelFromEnabledModels(models).modelId).toBe(
      AUTO_FAST_MODEL_CONFIG.modelId
    );
  });

  it("keeps custom (non-tiered) models selectable when the user is tier-capped", async () => {
    const auth = await userAuthForTierCap("cost_efficient");

    const [model] = await withModelSelectability(auth, {
      models: [CUSTOM_MODEL_CONFIG],
    });
    expect(model.isSelectable).toBe(true);
    expect(model.supportedReasoningEfforts).toEqual(
      CUSTOM_MODEL_CONFIG.supportedReasoningEfforts
    );
  });
});

describe("getModelsForAuth", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    adminAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  it("reports complete selection availability for legacy plans", async () => {
    const { models, defaultModel } = await getModelsForAuth(adminAuth);
    const sonnet = models.find(
      (model) =>
        model.modelId === CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );
    const singleEffortModel = models.find(
      (model) => model.modelId === FIREWORKS_GLM_5P2_MODEL_CONFIG.modelId
    );
    const premiumStream = models.find(
      (model) => model.modelId === AUTO_COMPLEX_MODEL_CONFIG.modelId
    );

    expect(sonnet?.selectionAvailability).toEqual({
      defaultReasoningEffort: "medium",
      reasoningEfforts: [
        { effort: "light", unavailabilityReason: null },
        { effort: "medium", unavailabilityReason: null },
        { effort: "high", unavailabilityReason: "workspace_plan" },
      ],
      lockReason: null,
    });
    expect(singleEffortModel?.selectionAvailability?.reasoningEfforts).toEqual([
      { effort: "light", unavailabilityReason: "unsupported" },
      { effort: "medium", unavailabilityReason: "unsupported" },
      { effort: "high", unavailabilityReason: null },
    ]);
    expect(premiumStream?.selectionAvailability?.lockReason).toBe(
      "workspace_plan"
    );
    expect(defaultModel.selectionAvailability).toBeDefined();
  });

  it("uses the workspace feature flag to unlock premium options", async () => {
    await FeatureFlagFactory.basic(adminAuth, "claude_4_5_opus_feature");

    const { models } = await getModelsForAuth(adminAuth);
    const sonnet = models.find(
      (model) =>
        model.modelId === CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );
    const premiumStream = models.find(
      (model) => model.modelId === AUTO_COMPLEX_MODEL_CONFIG.modelId
    );

    expect(sonnet?.selectionAvailability?.reasoningEfforts).toContainEqual({
      effort: "high",
      unavailabilityReason: null,
    });
    expect(premiumStream?.selectionAvailability?.lockReason).toBeNull();
  });
});

describe("resolveStreamModel", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    adminAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await FeatureFlagFactory.basic(adminAuth, "claude_4_5_opus_feature");
  });

  async function userAuthForTierCap(tierName: "cost_efficient" | "balanced") {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await setUserMaxAllowedTier(adminAuth, {
      userId: user.sId,
      tierName,
    });

    return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
  }

  async function resolveStreamForAuth(
    auth: Authenticator,
    streamId: ModelStreamIdType,
    degradedModelIds: ReadonlySet<string> = new Set()
  ) {
    const models = await getEnabledModelsForAuth(auth);
    return resolveStreamModel(models, streamId, degradedModelIds);
  }

  it("routes the Auto stream to its first available candidate + effort", async () => {
    const resolved = await resolveStreamForAuth(adminAuth, "auto");

    expect(resolved.fromPool).toBe(true);
    // In a full workspace every candidate is available, so the first one wins.
    expect(resolved.model.modelId).toBe(GPT_5_6_LUNA_MODEL_ID);
    expect(resolved.reasoningEffort).toBe("high");
  });

  it("routes the Basic stream to its first available candidate + effort", async () => {
    const resolved = await resolveStreamForAuth(adminAuth, "auto_fast");

    expect(resolved.fromPool).toBe(true);
    // In a full workspace every candidate is available, so the first one wins.
    expect(resolved.model.modelId).toBe(GPT_5_6_LUNA_MODEL_ID);
    expect(resolved.reasoningEffort).toBe("light");
  });

  it("routes the Premium stream to its first available candidate + effort", async () => {
    const resolved = await resolveStreamForAuth(adminAuth, "auto_complex");

    expect(resolved.fromPool).toBe(true);
    expect(resolved.model.modelId).toBe(
      CLAUDE_OPUS_5_DEFAULT_MODEL_CONFIG.modelId
    );
    expect(resolved.reasoningEffort).toBe("high");
  });

  it("keeps a Basic-tier candidate in the Premium stream for cost_efficient-capped users", async () => {
    const auth = await userAuthForTierCap("cost_efficient");

    // Every premium/balanced candidate is unavailable under a cost_efficient
    // cap, so the stream must still resolve to its Basic-tier floor rather
    // than falling out of the Premium stream entirely.
    const resolved = await resolveStreamForAuth(auth, "auto_complex");

    expect(resolved.fromPool).toBe(true);
    expect(resolved.model.modelId).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );
    expect(resolved.reasoningEffort).toBe("light");
  });

  it("only ever resolves to a candidate declared in the stream", async () => {
    for (const streamId of ["auto", "auto_fast", "auto_complex"] as const) {
      const resolved = await resolveStreamForAuth(adminAuth, streamId);
      const candidate = MODEL_STREAMS[streamId].find(
        (c) =>
          c.modelId === resolved.model.modelId &&
          c.reasoningEffort === resolved.reasoningEffort
      );
      expect(candidate).toBeDefined();
    }
  });

  it("falls back to a preferred large model when no candidate is available", async () => {
    const models = await getEnabledModelsForAuth(adminAuth);
    const resolved = resolveStreamModel(
      // Nothing is selectable, so no stream candidate can match.
      models.map((m) => ({ ...m, isSelectable: false })),
      "auto_complex",
      new Set()
    );

    expect(resolved.fromPool).toBe(false);
    expect(resolved.model.isSelectable).toBe(true);
  });

  it("skips a degraded candidate and takes the next one in the pool", async () => {
    const resolved = await resolveStreamForAuth(
      adminAuth,
      "auto",
      new Set([GPT_5_6_LUNA_MODEL_ID])
    );

    expect(resolved.fromPool).toBe(true);
    expect(resolved.model.modelId).toBe(
      CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG.modelId
    );
    expect(resolved.reasoningEffort).toBe("medium");
  });

  it("keeps a degraded model out of the last-resort fallback", async () => {
    const models = await getEnabledModelsForAuth(adminAuth);
    // Luna is the only selectable model, so it is both the stream's first
    // candidate and what the preferred-large-model fallback would land on --
    // and it is degraded, so neither may pick it.
    const resolved = resolveStreamModel(
      models.map((m) => ({
        ...m,
        isSelectable: m.modelId === GPT_5_6_LUNA_MODEL_ID,
      })),
      "auto",
      new Set([GPT_5_6_LUNA_MODEL_ID])
    );

    expect(resolved.fromPool).toBe(false);
    expect(resolved.model.modelId).not.toBe(GPT_5_6_LUNA_MODEL_ID);
  });
});
