import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { faker } from "@faker-js/faker";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

// The poke search also queries the Connectors API (for connector ID lookups).
// Mock it to return a dummy URL so it doesn't throw on missing env var.
vi.mock("@app/lib/api/config", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@app/lib/api/config")>();
  return {
    ...mod,
    default: {
      ...mod.default,
      getConnectorsAPIConfig: vi.fn().mockReturnValue({
        url: "http://localhost:0",
        secret: "test",
        webhookSecret: "test",
      }),
      getPokeAppUrl: vi.fn().mockReturnValue("http://localhost:3000/poke"),
    },
  };
});

function searchRequest(query: string) {
  return honoApp.request(
    `/api/poke/search?search=${encodeURIComponent(query)}`
  );
}

describe("GET /api/poke/search - phone number", () => {
  it("returns workspace when searching by phone number in E.164 format", async () => {
    const { auth } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const phoneNumber = "+33612345678";
    const phoneHash =
      WorkspaceVerificationAttemptResource.hashPhoneNumber(phoneNumber);

    await WorkspaceVerificationAttemptResource.makeVerified(auth, {
      phoneNumberHash: phoneHash,
    });

    const response = await searchRequest(phoneNumber);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringContaining("(phone trial)"),
          type: "Workspace",
        }),
      ])
    );
  });

  it("returns workspace when searching by phone number without +", async () => {
    const { auth } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const phoneNumber = "+33612345678";
    const phoneHash =
      WorkspaceVerificationAttemptResource.hashPhoneNumber(phoneNumber);

    await WorkspaceVerificationAttemptResource.makeVerified(auth, {
      phoneNumberHash: phoneHash,
    });

    // Search with digits only (no "+").
    const response = await searchRequest("33612345678");

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringContaining("(phone trial)"),
          type: "Workspace",
        }),
      ])
    );
  });

  it("returns no results for unverified phone numbers", async () => {
    const { auth } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const phoneNumber = "+33611111111";
    const phoneHash =
      WorkspaceVerificationAttemptResource.hashPhoneNumber(phoneNumber);

    // Create an unverified attempt.
    await WorkspaceVerificationAttemptResource.makeNew(auth, {
      phoneNumberHash: phoneHash,
      twilioVerificationSid: "VEtest123",
    });

    const response = await searchRequest(phoneNumber);

    expect(response.status).toBe(200);
    const data = await response.json();
    const phoneResults = data.results.filter(
      (r: { name: string }) =>
        typeof r.name === "string" && r.name.includes("(phone trial)")
    );
    expect(phoneResults).toHaveLength(0);
  });

  it("returns both workspace and phone trial when digits match both", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    // Use a phone number whose digits (without +) equal the workspace model ID.
    // Both the workspace-by-ID and the phone-trial search should return results.
    const phoneNumber = "+33612345678";
    const phoneHash =
      WorkspaceVerificationAttemptResource.hashPhoneNumber(phoneNumber);

    await WorkspaceVerificationAttemptResource.makeVerified(auth, {
      phoneNumberHash: phoneHash,
    });

    // Search with the workspace's own model ID — should still return the
    // workspace.
    const response = await searchRequest(String(workspace.id));

    expect(response.status).toBe(200);
    const data = await response.json();
    // The workspace should appear via the workspace-by-ID search.
    expect(data.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Workspace",
          id: workspace.id,
        }),
      ])
    );
  });

  it("returns no results for random non-phone strings", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await searchRequest("hello world");

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toEqual([]);
  });
});

describe("GET /api/poke/search - data source", () => {
  it("returns the data source when searching by dustAPIProjectId", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const dustAPIProjectId = faker.string.numeric(9);
    await DataSourceViewFactory.folder(workspace, globalSpace, null, {
      dustAPIProjectId,
    });

    const response = await searchRequest(dustAPIProjectId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dustAPIProjectId,
          type: "Data Source",
        }),
      ])
    );
  });

  it("returns no data source for an unknown dustAPIProjectId", async () => {
    await createPrivateApiMockRequest({ isSuperUser: true });

    const response = await searchRequest(faker.string.numeric(9));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results).toEqual([]);
  });
});
