import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enrichCompanyFromDomain: vi.fn(),
  fetchUsersFromWorkOSWithEmails: vi.fn(),
  hasValidMxRecords: vi.fn(),
  isDomainAutoJoinEnabled: vi.fn(),
  sendUserOperationMessage: vi.fn(),
}));

vi.mock("@app/lib/api/enrichment/company", () => ({
  ENTERPRISE_THRESHOLD: 500,
  enrichCompanyFromDomain: mocks.enrichCompanyFromDomain,
}));

vi.mock("@app/lib/api/workos/user", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@app/lib/api/workos/user")>();
  return {
    ...mod,
    fetchUsersFromWorkOSWithEmails: mocks.fetchUsersFromWorkOSWithEmails,
  };
});

vi.mock("@app/lib/resources/workspace_resource", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/lib/resources/workspace_resource")>();
  return {
    ...mod,
    WorkspaceResource: class extends mod.WorkspaceResource {
      static isDomainAutoJoinEnabled = mocks.isDomainAutoJoinEnabled;
    },
  };
});

vi.mock("@app/lib/utils/email", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@app/lib/utils/email")>();
  return {
    ...mod,
    hasValidMxRecords: mocks.hasValidMxRecords,
  };
});

vi.mock("@app/types/shared/user_operation", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/types/shared/user_operation")>();
  return {
    ...mod,
    sendUserOperationMessage: mocks.sendUserOperationMessage,
  };
});

function enrichmentRequest(email: string) {
  return honoApp.request("/api/enrichment/company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/enrichment/company", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.fetchUsersFromWorkOSWithEmails.mockResolvedValue([{ id: "user_123" }]);
    mocks.isDomainAutoJoinEnabled.mockResolvedValue(false);
    mocks.hasValidMxRecords.mockResolvedValue(true);
    mocks.enrichCompanyFromDomain.mockResolvedValue({
      size: 100,
      name: "Example",
      region: "North America",
      funding: null,
      revenue: null,
    });
  });

  it("does not reveal existing personal accounts through the redirect URL", async () => {
    const response = await enrichmentRequest("existing@gmail.com");

    expect(response.status).toBe(200);
    const data = (await response.json()) as { redirectUrl: string };
    expect(data.redirectUrl).toBe(
      "/api/workos/login?screenHint=sign-up&loginHint=existing%40gmail.com"
    );
    expect(data.redirectUrl).not.toBe(
      "/api/workos/login?loginHint=existing%40gmail.com"
    );
    expect(mocks.fetchUsersFromWorkOSWithEmails).not.toHaveBeenCalled();
  });

  it("does not reveal existing work accounts through the redirect URL", async () => {
    const response = await enrichmentRequest("existing@example.com");

    expect(response.status).toBe(200);
    const data = (await response.json()) as { redirectUrl: string };
    expect(data.redirectUrl).toBe(
      "/api/workos/login?screenHint=sign-up&loginHint=existing%40example.com"
    );
    expect(data.redirectUrl).not.toBe(
      "/api/workos/login?loginHint=existing%40example.com"
    );
    expect(mocks.fetchUsersFromWorkOSWithEmails).not.toHaveBeenCalled();
  });
});
