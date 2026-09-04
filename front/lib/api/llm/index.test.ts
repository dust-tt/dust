import { getWorkspaceFilter, legacyModelIdToModel } from "@app/lib/api/llm";
import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { getStreamEndpoints } from "@app/lib/llms/stream";
import type { WorkspaceConfig } from "@app/lib/llms/types/filter";
import {
  AGENT_PLATFORM_HOST,
  GOOGLE_AI_STUDIO_HOST,
} from "@app/lib/model_constructors/types/hosts";
import {
  GEMINI_3_1_PRO,
  GEMINI_3_8_FLASH,
  GLM_5P2,
} from "@app/lib/model_constructors/types/models";
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
      model: { eq: GEMINI_3_8_FLASH },
    });
    expect(flashEndpoints.length).toBeGreaterThan(0);
    expect(flashEndpoints.every((e) => e.host === AGENT_PLATFORM_HOST)).toBe(
      true
    );
    expect(flashEndpoints.map((e) => e.region).sort()).toEqual([
      "eu",
      "global",
    ]);

    const proEndpoints = getStreamEndpoints(workspaceConfig, {
      ...filter,
      model: { eq: GEMINI_3_1_PRO },
    });
    expect(proEndpoints.every((e) => e.host !== GOOGLE_AI_STUDIO_HOST)).toBe(
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
      model: { eq: GEMINI_3_1_PRO },
    });
    expect(proEndpoints.some((e) => e.host === GOOGLE_AI_STUDIO_HOST)).toBe(
      true
    );

    const flashEndpoints = getStreamEndpoints(workspaceConfig, {
      ...filter,
      model: { eq: GEMINI_3_8_FLASH },
    });
    expect(flashEndpoints.some((e) => e.host === GOOGLE_AI_STUDIO_HOST)).toBe(
      true
    );
  });
});

describe("legacyModelIdToModel", () => {
  it("strips the Fireworks prefix from legacy ids", () => {
    expect(legacyModelIdToModel("accounts/fireworks/models/glm-5p2")).toBe(
      GLM_5P2
    );
  });

  it("passes through non-Fireworks ids unchanged", () => {
    expect(legacyModelIdToModel("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });

  it("returns null for unknown ids", () => {
    expect(legacyModelIdToModel("accounts/fireworks/models/not-a-model")).toBe(
      null
    );
    expect(legacyModelIdToModel("bogus")).toBe(null);
  });
});
