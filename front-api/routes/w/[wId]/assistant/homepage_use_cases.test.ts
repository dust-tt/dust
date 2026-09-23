import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const GMAIL_USE_CASE_ID = "unanswered-messages";

const ReferenceSchema = z.object({ id: z.string(), name: z.string() });

const UseCasesResponseSchema = z.object({
  useCases: z.array(
    z.object({
      id: z.string(),
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
  const { workspace } = await createPrivateApiMockRequest({ role });
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );

  if (withFlag) {
    await FeatureFlagFactory.basic(adminAuth, "discovery_homepage");
  }

  return { adminAuth, workspace };
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
      GMAIL_USE_CASE_ID
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
      useCases.find((useCase) => useCase.id === GMAIL_USE_CASE_ID)
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
      GMAIL_USE_CASE_ID
    );
  });

  it("omits a tool living in a space the member cannot read", async () => {
    const { workspace } = await setupWorkspace();
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await MCPServerViewFactory.internal(workspace, "gmail", restrictedSpace);

    const { status, useCases } = await getUseCases(workspace.sId);

    expect(status).toBe(200);
    expect(useCases.map((useCase) => useCase.id)).not.toContain(
      GMAIL_USE_CASE_ID
    );
  });
});
