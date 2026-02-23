import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { describe, expect, it, vi } from "vitest";

import handler from "./search";

// The poke search also queries the Connectors API (for connector ID lookups).
// Mock it to return a dummy URL so it doesn't throw on missing env var.
vi.mock(import("@app/lib/api/config"), async (importOriginal) => {
  const mod = await importOriginal();
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

describe("GET /api/poke/search - phone number", () => {
  it("returns workspace when searching by phone number in E.164 format", async () => {
    const { req, res, authenticator } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const phoneNumber = "+33612345678";
    const phoneHash =
      WorkspaceVerificationAttemptResource.hashPhoneNumber(phoneNumber);

    await WorkspaceVerificationAttemptResource.makeVerified(authenticator, {
      phoneNumberHash: phoneHash,
    });

    req.query.search = phoneNumber;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
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
    const { req, res, authenticator } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const phoneNumber = "+33612345678";
    const phoneHash =
      WorkspaceVerificationAttemptResource.hashPhoneNumber(phoneNumber);

    await WorkspaceVerificationAttemptResource.makeVerified(authenticator, {
      phoneNumberHash: phoneHash,
    });

    // Search with digits only (no "+").
    req.query.search = "33612345678";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
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
    const { req, res, authenticator } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const phoneNumber = "+33611111111";
    const phoneHash =
      WorkspaceVerificationAttemptResource.hashPhoneNumber(phoneNumber);

    // Create an unverified attempt.
    await WorkspaceVerificationAttemptResource.makeNew(authenticator, {
      phoneNumberHash: phoneHash,
      twilioVerificationSid: "VEtest123",
    });

    req.query.search = phoneNumber;
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    const phoneResults = data.results.filter(
      (r: { name: string }) =>
        typeof r.name === "string" && r.name.includes("(phone trial)")
    );
    expect(phoneResults).toHaveLength(0);
  });

  it("returns both workspace and phone trial when digits match both", async () => {
    const { req, res, workspace, authenticator } =
      await createPrivateApiMockRequest({
        isSuperUser: true,
        role: "admin",
      });

    // Use a phone number whose digits (without +) equal the workspace model ID.
    // Both the workspace-by-ID and the phone-trial search should return results.
    const phoneNumber = "+33612345678";
    const phoneHash =
      WorkspaceVerificationAttemptResource.hashPhoneNumber(phoneNumber);

    await WorkspaceVerificationAttemptResource.makeVerified(authenticator, {
      phoneNumberHash: phoneHash,
    });

    // Search with the workspace's own model ID — should still return the workspace.
    req.query.search = String(workspace.id);
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
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
    const { req, res } = await createPrivateApiMockRequest({
      isSuperUser: true,
    });

    req.query.search = "hello world";
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.results).toEqual([]);
  });
});
