import { Authenticator } from "@app/lib/auth";
import { setUserMaxAllowedTier } from "@app/lib/model_tiers/allowed_tiers";
import {
  getDefaultModelFromEnabledModels,
  getEnabledModelsForAuth,
  getFallbackStreamIds,
  resolveStreamModel,
  resolveStreamModelWithFallback,
  withModelSelectability,
} from "@app/lib/model_tiers/enabled_models";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import {
  CLAUDE_FABLE_5_DEFAULT_MODEL_CONFIG,
  CLAUDE_FABLE_5_MODEL_ID,
  CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
  CLAUDE_OPUS_5_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import {
  AUTO_COMPLEX_MODEL_CONFIG,
  AUTO_FAST_MODEL_CONFIG,
  AUTO_MODEL_CONFIG,
  AUTO_ULTRA_MODEL_CONFIG,
  isModelStreamId,
  MODEL_STREAMS,
} from "@app/types/assistant/models/auto";
import { FIREWORKS_KIMI_K3_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import {
  GPT_5_6_LUNA_MODEL_ID,
  GPT_6_ASTRA_MODEL_ID,
} from "@app/types/assistant/models/openai";
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

  async function userAuthForTierCap(tierName: ModelsTierName) {
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

  it("marks ultra-tier models as not selectable when capped at premium", async () => {
    const auth = await userAuthForTierCap("premium");

    const [fable, opus] = await withModelSelectability(auth, {
      models: [
        CLAUDE_FABLE_5_DEFAULT_MODEL_CONFIG,
        CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
      ],
    });

    expect(fable.isSelectable).toBe(false);
    expect(opus.isSelectable).toBe(true);
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
        AUTO_ULTRA_MODEL_CONFIG,
      ],
    });

    // Under a balanced cap the Basic and Standard streams stay selectable, but
    // the Premium and Ultra streams are out of reach.
    expect(models.map((m) => [m.modelId, m.isSelectable])).toEqual([
      [AUTO_FAST_MODEL_CONFIG.modelId, true],
      [AUTO_MODEL_CONFIG.modelId, true],
      [AUTO_COMPLEX_MODEL_CONFIG.modelId, false],
      [AUTO_ULTRA_MODEL_CONFIG.modelId, false],
    ]);
  });

  it("gates the Ultra stream above a premium cap", async () => {
    const auth = await userAuthForTierCap("premium");

    const models = await withModelSelectability(auth, {
      models: [AUTO_COMPLEX_MODEL_CONFIG, AUTO_ULTRA_MODEL_CONFIG],
    });

    expect(models.map((m) => [m.modelId, m.isSelectable])).toEqual([
      [AUTO_COMPLEX_MODEL_CONFIG.modelId, true],
      [AUTO_ULTRA_MODEL_CONFIG.modelId, false],
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

describe("resolveStreamModel", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.creditPriced();
    adminAuth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  });

  async function userAuthForTierCap(tierName: ModelsTierName) {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    await setUserMaxAllowedTier(adminAuth, {
      userId: user.sId,
      tierName,
    });

    return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
  }

  function mustResolve<T>(resolution: T | null): T {
    if (resolution === null) {
      throw new Error("Expected the stream to resolve");
    }
    return resolution;
  }

  async function resolveStreamForAuth(
    auth: Authenticator,
    streamId: ModelStreamIdType,
    degradedModelIds: ReadonlySet<string> = new Set()
  ) {
    const models = await getEnabledModelsForAuth(auth);
    return mustResolve(resolveStreamModel(models, streamId, degradedModelIds));
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

  it("routes the Ultra stream to its first available candidate + effort", async () => {
    // Fable needs its own flag, which this workspace lacks, so Astra leads.
    const resolved = await resolveStreamForAuth(adminAuth, "auto_ultra");

    expect(resolved.fromPool).toBe(true);
    expect(resolved.model.modelId).toBe(GPT_6_ASTRA_MODEL_ID);
    expect(resolved.reasoningEffort).toBe("high");
  });

  it("routes the Ultra stream to Fable once its flag is on", async () => {
    await FeatureFlagFactory.basic(adminAuth, "claude_fable_5_feature");

    const resolved = await resolveStreamForAuth(adminAuth, "auto_ultra");

    expect(resolved.fromPool).toBe(true);
    expect(resolved.model.modelId).toBe(CLAUDE_FABLE_5_MODEL_ID);
    expect(resolved.reasoningEffort).toBe("high");
  });

  it("lands the Ultra stream on its Premium floor when no Ultra model is available", async () => {
    const resolved = await resolveStreamForAuth(
      adminAuth,
      "auto_ultra",
      new Set([GPT_6_ASTRA_MODEL_ID, CLAUDE_FABLE_5_MODEL_ID])
    );

    expect(resolved.fromPool).toBe(true);
    expect(resolved.model.modelId).toBe(
      CLAUDE_OPUS_5_DEFAULT_MODEL_CONFIG.modelId
    );
    expect(resolved.reasoningEffort).toBe("high");
  });

  it("never resolves a non-Ultra stream to an Ultra model nor to a stream", async () => {
    const models = await getEnabledModelsForAuth(adminAuth);
    // Only an Ultra model and the stream sentinels are selectable, so every
    // other stream is out of candidates and must resolve to neither.
    const ultraOnly = models.map((m) => ({
      ...m,
      isSelectable:
        m.modelId === GPT_6_ASTRA_MODEL_ID || isModelStreamId(m.modelId),
    }));

    for (const streamId of ["auto", "auto_fast", "auto_complex"] as const) {
      expect(resolveStreamModel(ultraOnly, streamId, new Set())).toBeNull();
    }

    const ultra = mustResolve(
      resolveStreamModel(ultraOnly, "auto_ultra", new Set())
    );
    expect(ultra.model.modelId).toBe(GPT_6_ASTRA_MODEL_ID);
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
    for (const streamId of [
      "auto",
      "auto_fast",
      "auto_complex",
      "auto_ultra",
    ] as const) {
      const resolved = await resolveStreamForAuth(adminAuth, streamId);
      const candidate = MODEL_STREAMS[streamId].find(
        (c) =>
          c.modelId === resolved.model.modelId &&
          c.reasoningEffort === resolved.reasoningEffort
      );
      expect(candidate).toBeDefined();
    }
  });

  it("falls back to a selectable large model outside the pool before giving up", async () => {
    const models = await getEnabledModelsForAuth(adminAuth);
    // Only Kimi K3 is selectable: it is in no pool, so the Premium stream
    // falls back to it rather than to a model the member cannot run.
    const kimiOnly = models.map((m) => ({
      ...m,
      isSelectable: m.modelId === FIREWORKS_KIMI_K3_MODEL_CONFIG.modelId,
    }));
    const resolved = mustResolve(
      resolveStreamModel(kimiOnly, "auto_complex", new Set())
    );

    expect(resolved.fromPool).toBe(false);
    expect(resolved.model.modelId).toBe(FIREWORKS_KIMI_K3_MODEL_CONFIG.modelId);
  });

  it("resolves to null when no selectable concrete model is left", async () => {
    const models = await getEnabledModelsForAuth(adminAuth);
    // Nothing is selectable, so the stream must not manufacture a model.
    const resolved = resolveStreamModel(
      models.map((m) => ({ ...m, isSelectable: false })),
      "auto_complex",
      new Set()
    );

    expect(resolved).toBeNull();
  });

  it("skips a degraded candidate and takes the next one in the pool", async () => {
    const resolved = await resolveStreamForAuth(
      adminAuth,
      "auto",
      new Set([GPT_5_6_LUNA_MODEL_ID])
    );

    expect(resolved.fromPool).toBe(true);
    expect(resolved.model.modelId).toBe(
      CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.modelId
    );
    expect(resolved.reasoningEffort).toBe("medium");
  });

  it("reports an operational fallback when degradation changes the resolution", async () => {
    const models = await getEnabledModelsForAuth(adminAuth);
    const resolved = mustResolve(
      resolveStreamModelWithFallback(
        models,
        "auto",
        new Set([GPT_5_6_LUNA_MODEL_ID])
      )
    );

    expect(resolved.didFallback).toBe(true);
    expect(resolved.model.modelId).toBe(
      CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.modelId
    );
  });

  it("reports every stream whose preferred resolution is degraded", async () => {
    const models = await getEnabledModelsForAuth(adminAuth);

    expect(
      getFallbackStreamIds(models, new Set([GPT_5_6_LUNA_MODEL_ID]))
    ).toEqual(["auto", "auto_fast"]);
  });

  it("resolves to null rather than a stream when only stream sentinels remain", async () => {
    // Only Luna and the stream sentinels are selectable: once Luna is degraded
    // there is no concrete model left, and a sentinel must not stand in.
    const models = (await getEnabledModelsForAuth(adminAuth)).map((model) => ({
      ...model,
      isSelectable:
        isModelStreamId(model.modelId) ||
        model.modelId === GPT_5_6_LUNA_MODEL_ID,
    }));
    const resolved = resolveStreamModelWithFallback(
      models,
      "auto",
      new Set([GPT_5_6_LUNA_MODEL_ID])
    );

    expect(resolved).toBeNull();
    expect(
      getFallbackStreamIds(models, new Set([GPT_5_6_LUNA_MODEL_ID]))
    ).not.toContain("auto");
  });

  it("does not report a fallback when degradation does not change the resolution", async () => {
    const models = await getEnabledModelsForAuth(adminAuth);
    const resolved = mustResolve(
      resolveStreamModelWithFallback(
        models,
        "auto",
        new Set([CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG.modelId])
      )
    );

    expect(resolved.didFallback).toBe(false);
    expect(resolved.model.modelId).toBe(GPT_5_6_LUNA_MODEL_ID);
  });

  it("keeps a degraded model out of the last-resort fallback", async () => {
    const models = await getEnabledModelsForAuth(adminAuth);
    // Luna is the only selectable model, so it is both the stream's first
    // candidate and what the preferred-large-model fallback would land on --
    // and it is degraded, so neither may pick it: nothing is left to resolve.
    const resolved = resolveStreamModel(
      models.map((m) => ({
        ...m,
        isSelectable: m.modelId === GPT_5_6_LUNA_MODEL_ID,
      })),
      "auto",
      new Set([GPT_5_6_LUNA_MODEL_ID])
    );

    expect(resolved).toBeNull();
  });
});
