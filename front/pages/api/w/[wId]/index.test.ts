import { faker } from "@faker-js/faker";
import { describe, expect } from "vitest";

import { WorkspaceHasDomainModel } from "@app/lib/models/workspace_has_domain";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

describe("POST /api/w/[wId]", () => {
  itInTransaction("returns 403 when user is not admin", async () => {
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
          "Only users that are `admins` for the current workspace can modify it.",
      },
    });
  });

  itInTransaction("updates workspace name", async () => {
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
  });

  itInTransaction("updates SSO enforcement", async () => {
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

  itInTransaction(
    "updates whitelisted providers and default embedding provider",
    async () => {
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
    }
  );

  itInTransaction("updates domain auto join settings", async () => {
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

  itInTransaction("returns 400 when updating non-existent domain", async () => {
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

  itInTransaction("returns 400 on invalid request body", async () => {
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

  itInTransaction("returns 405 for non-POST methods", async () => {
    for (const method of ["GET", "PUT", "DELETE"] as const) {
      const { req, res } = await createPrivateApiMockRequest({
        method,
        role: "admin",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
    }
  });
});
