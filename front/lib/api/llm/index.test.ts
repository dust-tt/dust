import { getWorkspaceFilter } from "@app/lib/api/llm";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { getStreamEndpoints } from "@app/lib/llms/stream";
import type { WorkspaceConfig } from "@app/lib/llms/types/filter";
import {
  GEMINI_3_1_PRO_MODEL_ID,
  GEMINI_3_5_FLASH_MODEL_ID,
} from "@app/lib/model_constructors/types/model_ids";
import {
  AGENT_PLATFORM_API,
  GOOGLE_AI_STUDIO_API,
} from "@app/lib/model_constructors/types/provider_apis";
import {
  isCreditPricedPlanPrefix,
  isEnterpriseOrDust,
} from "@app/lib/plans/plan_codes";
import { ProviderCredentialFactory } from "@app/tests/utils/ProviderCredentialFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

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
