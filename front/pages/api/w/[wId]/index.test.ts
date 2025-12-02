import { faker } from "@faker-js/faker";
import type { Organization } from "@workos-inc/node";
import { describe, expect, it, vi } from "vitest";

import * as workosClient from "@app/lib/api/workos/client";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";

import handler from "./index";

describe("GET /api/w/[wId]", () => {
  it("returns 403 when user is not admin", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  });

  it("returns the workspace", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      workspace: expect.objectContaining({
        id: workspace.id,
        name: workspace.name,
      }),
    });
  });
});

describe("POST /api/w/[wId]", () => {
  it("returns 403 when user is not admin", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  });

  it("updates workspace name", async () => {
    const getOrganizationByExternalIdSpy = vi.fn().mockResolvedValue({
      id: "org_123",
      name: "Old Workspace Name - sId123",
      object: "organization",
      allowProfilesOutsideOrganization: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      domains: [],
      externalId: "sId123",
      metadata: {},
      connectionCount: 0,
      state: "active",
    } as Organization);

    const updateOrganizationSpy = vi.fn().mockResolvedValue({
      id: "org_123",
      name: "New Workspace Name - sId123",
      object: "organization",
      allowProfilesOutsideOrganization: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      domains: [],
      externalId: "sId123",
      metadata: {},
      connectionCount: 0,
      state: "active",
    } as Organization);

    vi.spyOn(workosClient, "getWorkOS").mockImplementation(
      () =>
        ({
          organizations: {
            getOrganizationByExternalId: getOrganizationByExternalIdSpy,
            updateOrganization: updateOrganizationSpy,
          },
        }) as any
    );

    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      name: "New Workspace Name",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      workspace: expect.objectContaining({
        id: workspace.id,
        name: "New Workspace Name",
      }),
    });

    expect(updateOrganizationSpy).toHaveBeenCalled();
  });

  it("updates SSO enforcement", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      ssoEnforced: true,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      workspace: expect.objectContaining({
        id: workspace.id,
        ssoEnforced: true,
      }),
    });
  });

  it("updates whitelisted providers and default embedding provider", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      whiteListedProviders: ["openai", "anthropic"],
      defaultEmbeddingProvider: "openai",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      workspace: expect.objectContaining({
        id: workspace.id,
        whiteListedProviders: ["openai", "anthropic"],
        defaultEmbeddingProvider: "openai",
      }),
    });
  });

  it("updates domain auto join settings", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    // Create a workspace domain first
    const fakeDomain = faker.internet.domainName();
    await WorkspaceHasDomainModel.create({
      workspaceId: workspace.id,
      domain: fakeDomain,
      domainAutoJoinEnabled: false,
      useCases: ["sso"],
    });

    req.body = {
      domain: fakeDomain,
      domainAutoJoinEnabled: true,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    // Verify the domain was updated
    const updatedDomain = await WorkspaceHasDomainModel.findOne({
      where: {
        workspaceId: workspace.id,
        domain: fakeDomain,
      },
    });
    expect(updatedDomain?.domainAutoJoinEnabled).toBe(true);
  });

  it("returns 400 when updating non-existent domain", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      domain: "nonexistent.com",
      domainAutoJoinEnabled: true,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "The workspace does not have any verified domain.",
      },
    });
  });

  it("returns 400 on invalid request body", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      invalidField: "invalid",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns 405 for non-POST methods", async () => {
    for (const method of ["PUT", "DELETE"] as const) {
      const { req, res } = await createPrivateApiMockRequest({
        method,
        role: "admin",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, POST or GET is expected.",
        },
      });
    }
  });
});
