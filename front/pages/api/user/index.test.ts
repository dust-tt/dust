import { describe, expect } from "vitest";

import { UserModel } from "@app/lib/resources/storage/models/user";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

describe("GET /api/user", () => {
  itInTransaction("returns 200 when the user is authenticated", async () => {
    const { req, res, user, workspace, membership } =
      await createPrivateApiMockRequest();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      user: {
        id: user.id,
        sId: user.sId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        fullName: `${user.firstName} ${user.lastName}`,
        image: user.imageUrl,
        createdAt: user.createdAt.getTime(),
        provider: user.provider,
        workspaces: [
          {
            id: workspace.id,
            sId: workspace.sId,
            name: workspace.name,
            metadata: null,
            role: membership.role,
            segmentation: workspace.segmentation,
            whiteListedProviders: workspace.whiteListedProviders,
            defaultEmbeddingProvider: workspace.defaultEmbeddingProvider,
            ssoEnforced: workspace.ssoEnforced,
          },
        ],
      },
    });
  });

  itInTransaction("update the user on patch request", async () => {
    const { req, res, user } = await createPrivateApiMockRequest({
      method: "PATCH",
    });

    req.body = {
      firstName: "John",
      lastName: "Doe",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
    });

    const userAfterUpdate = await UserModel.findByPk(user.id);
    expect(userAfterUpdate?.firstName).toBe("John");
    expect(userAfterUpdate?.lastName).toBe("Doe");
  });

  itInTransaction("update requires firstName and lastName", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "PATCH",
    });

    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: expect.objectContaining({
        type: "invalid_request_error",
        message: expect.stringContaining("firstName"),
      }),
    });
  });

  itInTransaction("update ignores unknown fields", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "PATCH",
    });

    req.body = {
      firstName: "John",
      lastName: "Doe",
      unknownField: "unknownValue",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
    });
  });

  itInTransaction("only support GET and PATCH", async () => {
    for (const method of ["DELETE", "POST", "PUT"] as const) {
      const { req, res } = await createPrivateApiMockRequest({
        method,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    }
  });
});
