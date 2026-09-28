import type { HomepageUseCaseDefinition } from "@app/lib/api/homepage_use_cases/registry";
import { Authenticator } from "@app/lib/auth";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const DISMISSIBLE_USE_CASE_ID = "weekly-priorities";
const FEATURED_USE_CASE_ID = "featured-release";

// vi.mock is hoisted above the constants, so the id is repeated inline.
vi.mock(
  import("@app/lib/api/homepage_use_cases/registry"),
  async (importOriginal) => {
    const mod = await importOriginal();
    const featured: HomepageUseCaseDefinition = {
      id: "featured-release",
      label: "Try the new release",
      prompt: "Show me the new release.",
      icon: "ActionRocketIcon",
      audience: { type: "featured" },
      requires: [],
    };

    return {
      ...mod,
      HOMEPAGE_USE_CASES: [...mod.HOMEPAGE_USE_CASES, featured],
    };
  }
);

const UseCasesResponseSchema = z.object({
  useCases: z.array(z.object({ id: z.string(), isDismissible: z.boolean() })),
});

async function setupWorkspace() {
  const { workspace } = await createPrivateApiMockRequest({ role: "user" });
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  await FeatureFlagFactory.basic(adminAuth, "discovery_homepage");

  return { workspace };
}

async function getUseCases(workspaceId: string) {
  const response = await honoApp.request(
    `/api/w/${workspaceId}/assistant/homepage_use_cases`
  );

  return UseCasesResponseSchema.parse(await response.json()).useCases;
}

function dismiss(workspaceId: string, useCaseId: string) {
  return honoApp.request(
    `/api/w/${workspaceId}/assistant/homepage_use_cases/dismissals`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ useCaseId }),
    }
  );
}

describe("POST /api/w/[wId]/assistant/homepage_use_cases/dismissals", () => {
  beforeEach(async () => {
    const { getWorkOSSessionWithSetCookies } = await import(
      "@app/lib/api/workos/user"
    );
    vi.mocked(getWorkOSSessionWithSetCookies).mockResolvedValue({
      session: undefined,
      setCookies: [],
    });
  });

  it("stops offering a dismissed use case", async () => {
    const { workspace } = await setupWorkspace();

    const before = await getUseCases(workspace.sId);
    expect(
      before.find(({ id }) => id === DISMISSIBLE_USE_CASE_ID)
    ).toMatchObject({ isDismissible: true });

    const response = await dismiss(workspace.sId, DISMISSIBLE_USE_CASE_ID);
    expect(response.status).toBe(204);

    const after = await getUseCases(workspace.sId);
    expect(after.map(({ id }) => id)).not.toContain(DISMISSIBLE_USE_CASE_ID);
  });

  it("refuses to dismiss a featured use case", async () => {
    const { workspace } = await setupWorkspace();

    const before = await getUseCases(workspace.sId);
    expect(before.find(({ id }) => id === FEATURED_USE_CASE_ID)).toMatchObject({
      isDismissible: false,
    });

    const response = await dismiss(workspace.sId, FEATURED_USE_CASE_ID);
    expect(response.status).toBe(400);

    const after = await getUseCases(workspace.sId);
    expect(after.map(({ id }) => id)).toContain(FEATURED_USE_CASE_ID);
  });

  it("rejects an unknown use case", async () => {
    const { workspace } = await setupWorkspace();

    const response = await dismiss(workspace.sId, "does-not-exist");

    expect(response.status).toBe(404);
  });
});
