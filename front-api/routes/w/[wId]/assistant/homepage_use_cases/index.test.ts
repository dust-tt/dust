import { HOMEPAGE_USE_CASES } from "@app/lib/api/homepage_use_cases/registry";
import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { MAX_FEATURED_USE_CASES } from "@app/types/api/homepage_use_cases";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const EMAIL_USE_CASE_ID = "unanswered-messages";
const SALES_USE_CASE_ID = "account-research";
const POD_USE_CASE_ID = "create-pod";

const ReferenceSchema = z.object({ id: z.string(), name: z.string() });

const UseCasesResponseSchema = z.object({
  useCases: z.array(
    z.object({
      id: z.string(),
      tier: z.string(),
      skills: z.array(ReferenceSchema),
      tools: z.array(ReferenceSchema),
    })
  ),
});

async function setupWorkspace({
  role = "user",
  withFlag = true,
}: {
  role?: MembershipRoleType;
  withFlag?: boolean;
} = {}) {
  const { user, workspace } = await createPrivateApiMockRequest({ role });
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );

  if (withFlag) {
    await FeatureFlagFactory.basic(adminAuth, "discovery_homepage");
  }

  return { adminAuth, user, workspace };
}

async function getUseCases(workspaceId: string) {
  const response = await honoApp.request(
    `/api/w/${workspaceId}/assistant/homepage_use_cases`
  );
  if (response.status !== 200) {
    return { status: response.status, useCases: [] };
  }

  const { useCases } = UseCasesResponseSchema.parse(await response.json());

  return { status: response.status, useCases };
}

describe("GET /api/w/[wId]/assistant/homepage_use_cases", () => {
  beforeEach(async () => {
    const { getWorkOSSessionWithSetCookies } = await import(
      "@app/lib/api/workos/user"
    );
    vi.mocked(getWorkOSSessionWithSetCookies).mockResolvedValue({
      session: undefined,
      setCookies: [],
    });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await honoApp.request(
      "/api/w/w_unauthenticated/assistant/homepage_use_cases"
    );

    expect(response.status).toBe(401);
  });

  it("rejects workspaces without the discovery_homepage flag", async () => {
    const { workspace } = await setupWorkspace({ withFlag: false });

    const { status } = await getUseCases(workspace.sId);

    expect(status).toBe(403);
  });

  it("omits a use case whose tool the workspace does not have", async () => {
    const { workspace } = await setupWorkspace();

    const { status, useCases } = await getUseCases(workspace.sId);

    expect(status).toBe(200);
    expect(useCases.map((useCase) => useCase.id)).not.toContain(
      EMAIL_USE_CASE_ID
    );
  });

  it("returns a use case once its tool resolves in the global space", async () => {
    const { adminAuth, workspace } = await setupWorkspace();
    const globalSpace =
      await SpaceResource.fetchWorkspaceGlobalSpace(adminAuth);
    const view = await MCPServerViewFactory.internal(
      workspace,
      "gmail",
      globalSpace
    );

    const { status, useCases } = await getUseCases(workspace.sId);

    expect(status).toBe(200);
    expect(
      useCases.find((useCase) => useCase.id === EMAIL_USE_CASE_ID)
    ).toMatchObject({
      skills: [],
      tools: [{ id: view.sId, name: view.getDisplayName() }],
    });
  });

  it("omits a tool living in a space an admin is not a member of", async () => {
    const { workspace } = await setupWorkspace({ role: "admin" });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await MCPServerViewFactory.internal(workspace, "gmail", restrictedSpace);

    const { status, useCases } = await getUseCases(workspace.sId);

    expect(status).toBe(200);
    expect(useCases.map((useCase) => useCase.id)).not.toContain(
      EMAIL_USE_CASE_ID
    );
  });

  it("omits a tool living in a space the member cannot read", async () => {
    const { workspace } = await setupWorkspace();
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await MCPServerViewFactory.internal(workspace, "gmail", restrictedSpace);

    const { status, useCases } = await getUseCases(workspace.sId);

    expect(status).toBe(200);
    expect(useCases.map((useCase) => useCase.id)).not.toContain(
      EMAIL_USE_CASE_ID
    );
  });

  it("offers a role use case only to users with a matching job type", async () => {
    const { adminAuth, user, workspace } = await setupWorkspace();
    const globalSpace =
      await SpaceResource.fetchWorkspaceGlobalSpace(adminAuth);
    await MCPServerViewFactory.internal(
      workspace,
      "web_search_&_browse",
      globalSpace
    );

    const withoutJobType = await getUseCases(workspace.sId);
    expect(withoutJobType.useCases.map((useCase) => useCase.id)).not.toContain(
      SALES_USE_CASE_ID
    );

    await user.setMetadata("job_type", "engineering");
    const asEngineer = await getUseCases(workspace.sId);
    expect(asEngineer.useCases.map((useCase) => useCase.id)).not.toContain(
      SALES_USE_CASE_ID
    );

    await user.setMetadata("job_type", "sales");
    const asSales = await getUseCases(workspace.sId);
    expect(
      asSales.useCases.find((useCase) => useCase.id === SALES_USE_CASE_ID)
    ).toMatchObject({ tier: "role" });
  });

  it("stops offering the Pod use case once the user is in a Pod", async () => {
    const { user, workspace } = await setupWorkspace();

    const beforePod = await getUseCases(workspace.sId);
    expect(
      beforePod.useCases.find((useCase) => useCase.id === POD_USE_CASE_ID)
    ).toMatchObject({ tier: "milestone" });

    await SpaceFactory.project(workspace, user.id);

    const afterPod = await getUseCases(workspace.sId);
    expect(afterPod.useCases.map((useCase) => useCase.id)).not.toContain(
      POD_USE_CASE_ID
    );
  });

  it("attaches the favorite platform when several alternatives resolve", async () => {
    const { adminAuth, user, workspace } = await setupWorkspace();
    const globalSpace =
      await SpaceResource.fetchWorkspaceGlobalSpace(adminAuth);
    const gmailView = await MCPServerViewFactory.internal(
      workspace,
      "gmail",
      globalSpace
    );
    const outlookView = await MCPServerViewFactory.internal(
      workspace,
      "outlook",
      globalSpace
    );

    const withoutFavorites = await getUseCases(workspace.sId);
    expect(
      withoutFavorites.useCases.find(
        (useCase) => useCase.id === EMAIL_USE_CASE_ID
      )?.tools
    ).toEqual([{ id: gmailView.sId, name: gmailView.getDisplayName() }]);

    await user.setMetadata(
      "favorite_platforms",
      JSON.stringify(["outlook"]),
      workspace.id
    );
    const withOutlookFavorite = await getUseCases(workspace.sId);
    expect(
      withOutlookFavorite.useCases.find(
        (useCase) => useCase.id === EMAIL_USE_CASE_ID
      )?.tools
    ).toEqual([{ id: outlookView.sId, name: outlookView.getDisplayName() }]);
  });

  it("features at most MAX_FEATURED_USE_CASES use cases", () => {
    const featured = HOMEPAGE_USE_CASES.filter(
      ({ audience }) => audience.type === "featured"
    );

    expect(featured.length).toBeLessThanOrEqual(MAX_FEATURED_USE_CASES);
  });
});
