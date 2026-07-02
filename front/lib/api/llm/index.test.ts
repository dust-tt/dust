import { getWorkspaceFilter } from "@app/lib/api/llm";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { DUST_BATCH_ENDPOINTS } from "@app/lib/llms/batch";
import {
  DUST_STREAM_ENDPOINTS,
  getStreamEndpoints,
} from "@app/lib/llms/stream";
import type { WorkspaceConfig } from "@app/lib/llms/types/filter";
import {
  CLAUDE_SONNET_5_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
  GEMINI_3_5_FLASH_MODEL_ID,
  GPT_5_MODEL_ID,
} from "@app/lib/model_constructors/types/model_ids";
import {
  AGENT_PLATFORM_API,
  GOOGLE_AI_STUDIO_API,
} from "@app/lib/model_constructors/types/provider_apis";
import { OPENAI_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";
import {
  isCreditPricedPlanPrefix,
  isEnterpriseOrDust,
} from "@app/lib/plans/plan_codes";
import { ProviderCredentialFactory } from "@app/tests/utils/ProviderCredentialFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { afterEach, describe, expect, it, vi } from "vitest";

async function getWorkspaceConfig(
  auth: Authenticator
): Promise<WorkspaceConfig> {
  const plan = auth.getNonNullablePlan();

  return {
    featureFlags: await getFeatureFlags(auth),
    isEnterprise: isEnterpriseOrDust(plan),
    isCreditPriced: isCreditPricedPlanPrefix(plan.code),
  };
}

describe("getWorkspaceFilter", () => {
  it("routes non-byok gemini to agent-platform endpoints, never the direct Google AI Studio API", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const workspaceConfig = await getWorkspaceConfig(auth);
    const filter = getWorkspaceFilter(auth);

    const flashEndpoints = getStreamEndpoints(workspaceConfig, {
      ...filter,
      modelId: { eq: GEMINI_3_5_FLASH_MODEL_ID },
    });
    expect(flashEndpoints.length).toBeGreaterThan(0);
    expect(flashEndpoints.every((e) => e.api === AGENT_PLATFORM_API)).toBe(
      true
    );

    const proEndpoints = getStreamEndpoints(workspaceConfig, {
      ...filter,
      modelId: { eq: GEMINI_3_1_PRO_MODEL_ID },
    });
    expect(proEndpoints.every((e) => e.api !== GOOGLE_AI_STUDIO_API)).toBe(
      true
    );
  });

  it("keeps the direct Google AI Studio API endpoints for byok workspaces", async () => {
    const workspace = await WorkspaceFactory.byok();
    await ProviderCredentialFactory.basic(workspace, "google_ai_studio");
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const workspaceConfig = await getWorkspaceConfig(auth);
    const filter = getWorkspaceFilter(auth);

    const proEndpoints = getStreamEndpoints(workspaceConfig, {
      ...filter,
      modelId: { eq: GEMINI_3_1_PRO_MODEL_ID },
    });
    expect(proEndpoints.some((e) => e.api === GOOGLE_AI_STUDIO_API)).toBe(true);
  });
});

describe("getWorkspaceFilter EU region gating (regionalModelsOnly)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("admits OpenAI (global) and EU endpoints but excludes US-only endpoints", async () => {
    vi.spyOn(regionConfig, "getCurrentRegion").mockReturnValue("europe-west1");

    const workspace = await WorkspaceFactory.basic({
      regionalModelsOnly: true,
    });
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const workspaceConfig = await getWorkspaceConfig(auth);
    const filter = getWorkspaceFilter(auth);

    // OpenAI is `global`: its client uses OpenAI's EU base URL in the EU
    // deployment, so it stays available to regionalModelsOnly workspaces.
    const openaiEndpoints = getStreamEndpoints(workspaceConfig, {
      ...filter,
      modelId: { eq: GPT_5_MODEL_ID },
    });
    expect(openaiEndpoints.length).toBeGreaterThan(0);
    expect(openaiEndpoints.every((e) => e.region === GLOBAL)).toBe(true);

    // claude-sonnet-5 only has the US-direct endpoint (region `us`) -> excluded.
    const usOnlyEndpoints = getStreamEndpoints(workspaceConfig, {
      ...filter,
      modelId: { eq: CLAUDE_SONNET_5_MODEL_ID },
    });
    expect(usOnlyEndpoints).toHaveLength(0);
  });
});

describe("endpoint region tagging invariant", () => {
  // The EU `regionalModelsOnly` filter admits `global` endpoints because
  // `global` must mean "served in-region everywhere it runs" (today: OpenAI,
  // whose client uses the EU base URL in the EU deployment). Any `global`
  // endpoint that actually routes to the US would silently leak EU traffic. Any
  // new US-only endpoint must be tagged `us`, not `global`.
  it("only tags OpenAI endpoints as `global`", () => {
    const endpoints = [
      ...Object.values(DUST_STREAM_ENDPOINTS).map((e) => ({
        id: e.id,
        region: e.region,
        providerId: e.providerId,
      })),
      ...Object.values(DUST_BATCH_ENDPOINTS).map((e) => ({
        id: e.id,
        region: e.region,
        providerId: e.providerId,
      })),
    ];

    const leakyGlobalEndpointIds = endpoints
      .filter((e) => e.region === GLOBAL && e.providerId !== OPENAI_PROVIDER_ID)
      .map((e) => e.id);

    expect(leakyGlobalEndpointIds).toEqual([]);
  });
});
