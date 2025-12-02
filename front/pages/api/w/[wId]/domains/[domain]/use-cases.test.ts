import { faker } from "@faker-js/faker";
import type { NextApiRequest, NextApiResponse } from "next";
import type { RequestMethod } from "node-mocks-http";
import { createMocks } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

import handler from "./use-cases";

// Helper to create request with domain in query
async function createDomainApiMockRequest({
  method = "PATCH",
  role = "admin",
  domain,
}: {
  method?: RequestMethod;
  role?: "admin" | "builder" | "user";
  domain: string;
}) {
  const result = await createPrivateApiMockRequest({ method, role });

  // Override the request with the domain parameter
  const { req: baseReq, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    query: { wId: result.workspace.sId, domain },
    headers: {},
  });

  // Copy over the mocked session behavior
  return {
    ...result,
    req: baseReq,
    res,
  };
}

describe("PATCH /api/w/[wId]/domains/[domain]/use-cases", () => {
  it("returns 403 when user is not admin", async () => {
    const domain = faker.internet.domainName();
    const { req, res } = await createDomainApiMockRequest({
      method: "PATCH",
      role: "user",
      domain,
    });

    req.body = { action: "add", useCase: "mcp" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  it("adds a use case to a domain", async () => {
    const domain = faker.internet.domainName();
    const { req, res, workspace } = await createDomainApiMockRequest({
      method: "PATCH",
      role: "admin",
      domain,
    });

    // Create domain first
    await WorkspaceHasDomainModel.create({
      workspaceId: workspace.id,
      domain,
      domainAutoJoinEnabled: false,
      useCases: ["sso"],
    });

    req.body = { action: "add", useCase: "mcp" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.domain.useCases).toContain("sso");
    expect(data.domain.useCases).toContain("mcp");
  });

  it("removes a use case from a domain", async () => {
    const domain = faker.internet.domainName();
    const { req, res, workspace } = await createDomainApiMockRequest({
      method: "PATCH",
      role: "admin",
      domain,
    });

    // Create domain first
    await WorkspaceHasDomainModel.create({
      workspaceId: workspace.id,
      domain,
      domainAutoJoinEnabled: false,
      useCases: ["sso", "mcp"],
    });

    req.body = { action: "remove", useCase: "mcp" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.domain.useCases).toEqual(["sso"]);
  });

  it("returns null when removing last use case (domain deleted)", async () => {
    const domain = faker.internet.domainName();
    const { req, res, workspace } = await createDomainApiMockRequest({
      method: "PATCH",
      role: "admin",
      domain,
    });

    // Create domain first
    await WorkspaceHasDomainModel.create({
      workspaceId: workspace.id,
      domain,
      domainAutoJoinEnabled: false,
      useCases: ["sso"],
    });

    req.body = { action: "remove", useCase: "sso" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.domain).toBe(null);
  });

  it("returns 404 for non-existent domain", async () => {
    const { req, res } = await createDomainApiMockRequest({
      method: "PATCH",
      role: "admin",
      domain: "nonexistent.com",
    });

    req.body = { action: "add", useCase: "mcp" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 400 for invalid request body", async () => {
    const domain = faker.internet.domainName();
    const { req, res, workspace } = await createDomainApiMockRequest({
      method: "PATCH",
      role: "admin",
      domain,
    });

    await WorkspaceHasDomainModel.create({
      workspaceId: workspace.id,
      domain,
      domainAutoJoinEnabled: false,
      useCases: ["sso"],
    });

    req.body = { action: "invalid", useCase: "mcp" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 for invalid use case", async () => {
    const domain = faker.internet.domainName();
    const { req, res, workspace } = await createDomainApiMockRequest({
      method: "PATCH",
      role: "admin",
      domain,
    });

    await WorkspaceHasDomainModel.create({
      workspaceId: workspace.id,
      domain,
      domainAutoJoinEnabled: false,
      useCases: ["sso"],
    });

    req.body = { action: "add", useCase: "invalid_use_case" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });
});

describe("PUT /api/w/[wId]/domains/[domain]/use-cases", () => {
  it("replaces all use cases", async () => {
    const domain = faker.internet.domainName();
    const { req, res, workspace } = await createDomainApiMockRequest({
      method: "PUT",
      role: "admin",
      domain,
    });

    // Create domain first
    await WorkspaceHasDomainModel.create({
      workspaceId: workspace.id,
      domain,
      domainAutoJoinEnabled: false,
      useCases: ["sso"],
    });

    req.body = { useCases: ["mcp"] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.domain.useCases).toEqual(["mcp"]);
  });

  it("sets multiple use cases", async () => {
    const domain = faker.internet.domainName();
    const { req, res, workspace } = await createDomainApiMockRequest({
      method: "PUT",
      role: "admin",
      domain,
    });

    // Create domain first
    await WorkspaceHasDomainModel.create({
      workspaceId: workspace.id,
      domain,
      domainAutoJoinEnabled: false,
      useCases: ["sso"],
    });

    req.body = { useCases: ["sso", "mcp"] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.domain.useCases.sort()).toEqual(["mcp", "sso"]);
  });

  it("deletes domain when setting empty use cases", async () => {
    const domain = faker.internet.domainName();
    const { req, res, workspace } = await createDomainApiMockRequest({
      method: "PUT",
      role: "admin",
      domain,
    });

    // Create domain first
    await WorkspaceHasDomainModel.create({
      workspaceId: workspace.id,
      domain,
      domainAutoJoinEnabled: false,
      useCases: ["sso", "mcp"],
    });

    req.body = { useCases: [] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.domain).toBe(null);
  });

  it("returns 400 for invalid use case in array", async () => {
    const domain = faker.internet.domainName();
    const { req, res, workspace } = await createDomainApiMockRequest({
      method: "PUT",
      role: "admin",
      domain,
    });

    await WorkspaceHasDomainModel.create({
      workspaceId: workspace.id,
      domain,
      domainAutoJoinEnabled: false,
      useCases: ["sso"],
    });

    req.body = { useCases: ["sso", "invalid"] };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });
});

describe("unsupported methods", () => {
  it("returns 405 for GET", async () => {
    const domain = faker.internet.domainName();
    const { req, res } = await createDomainApiMockRequest({
      method: "GET",
      role: "admin",
      domain,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 405 for DELETE", async () => {
    const domain = faker.internet.domainName();
    const { req, res } = await createDomainApiMockRequest({
      method: "DELETE",
      role: "admin",
      domain,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
