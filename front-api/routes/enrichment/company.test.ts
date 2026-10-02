import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { sendUserOperationMessage } from "@app/types/shared/user_operation";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/workos/organization_primitives", async () => {
  const actual = await vi.importActual(
    "@app/lib/api/workos/organization_primitives"
  );
  return {
    ...actual,
    listWorkOSOrganizationsWithDomain: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("@app/lib/utils/email", async () => {
  const actual = await vi.importActual("@app/lib/utils/email");
  return { ...actual, hasValidMxRecords: vi.fn().mockResolvedValue(true) };
});

vi.mock("@app/lib/api/enrichment/company", async () => {
  const actual = await vi.importActual("@app/lib/api/enrichment/company");
  return {
    ...actual,
    enrichCompanyFromDomain: vi.fn().mockResolvedValue({
      size: 50,
      name: "Acme",
      region: null,
      funding: null,
      revenue: null,
    }),
  };
});

vi.mock("@app/types/shared/user_operation", () => ({
  sendUserOperationMessage: vi.fn(),
}));

vi.mock("@app/lib/utils/rate_limiter", async () => {
  const actual = await vi.importActual("@app/lib/utils/rate_limiter");
  return { ...actual, rateLimiter: vi.fn() };
});

function signUpUrl(email: string) {
  return `/api/workos/login?screenHint=sign-up&loginHint=${encodeURIComponent(email)}`;
}

function submit(email: string) {
  return honoApp.request("/api/enrichment/company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/enrichment/company", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimiter).mockResolvedValue(5);
  });

  it("responds identically for auto-join customer domains and unknown domains", async () => {
    const workspace = await WorkspaceFactory.basic();
    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    const customerDomain = `customer-${workspace.sId.toLowerCase()}.com`;
    expect(
      (
        await workspaceResource?.upsertWorkspaceDomain({
          domain: customerDomain,
        })
      )?.isOk()
    ).toBe(true);
    expect(
      (
        await workspaceResource?.updateDomainAutoJoinEnabled({
          domainAutoJoinEnabled: true,
          domain: customerDomain,
        })
      )?.isOk()
    ).toBe(true);

    for (const email of [`jane@${customerDomain}`, "jane@unknown.com"]) {
      const response = await submit(email);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        companySize: 50,
        companyName: "Acme",
        redirectUrl: signUpUrl(email),
      });
    }
  });

  it("routes emails that could inject Slack markup without notifying Slack", async () => {
    const email = "<https://evil.com|click>@acme.com";

    const response = await submit(email);

    expect(response.status).toBe(200);
    expect((await response.json()).redirectUrl).toBe(signUpUrl(email));
    expect(sendUserOperationMessage).not.toHaveBeenCalled();
  });

  it("falls back to the sign-up redirect without enrichment once rate limited", async () => {
    vi.mocked(rateLimiter).mockResolvedValue(0);

    const response = await submit("jane@acme.com");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      redirectUrl: signUpUrl("jane@acme.com"),
    });
    expect(sendUserOperationMessage).not.toHaveBeenCalled();
  });
});
