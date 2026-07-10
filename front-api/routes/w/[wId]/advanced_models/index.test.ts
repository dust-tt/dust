import { AdvancedModelResource } from "@app/lib/resources/advanced_model_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import {
  GetAdvancedModelsResponseBodySchema,
  GetGroupAllowedAdvancedModelsResponseBodySchema,
  GetUserAllowedAdvancedModelsResponseBodySchema,
  GetWorkspaceAllowedAdvancedModelsResponseBodySchema,
} from "@app/types/api/advanced_models";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/w/:wId/advanced_models", () => {
  it("returns 403 when caller is not an admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models`
    );

    expect(response.status).toBe(403);
  });

  it("returns the advanced model catalog for admins", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models`
    );

    expect(response.status).toBe(200);
    const data = GetAdvancedModelsResponseBodySchema.parse(
      await response.json()
    );

    expect(data.models).toEqual(
      AdvancedModelResource.getAdvancedModels().map((model) => ({
        providerId: model.providerId,
        modelId: model.modelId,
        displayName: model.displayName,
      }))
    );
  });
});

describe("POST/DELETE /api/w/:wId/advanced_models/allowed/workspace", () => {
  const advancedModel = AdvancedModelResource.getAdvancedModels()[0];
  const allAdvancedModels = AdvancedModelResource.getAdvancedModels().map(
    (model) => ({
      providerId: model.providerId,
      modelId: model.modelId,
    })
  );

  it("allows admins to add, list, and remove workspace allowed models", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const initialListResponse = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models/allowed/workspace`
    );
    expect(initialListResponse.status).toBe(200);
    expect(
      GetWorkspaceAllowedAdvancedModelsResponseBodySchema.parse(
        await initialListResponse.json()
      )
    ).toEqual({
      models: allAdvancedModels,
    });

    const addResponse = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models/allowed/workspace`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: advancedModel.providerId,
          modelId: advancedModel.modelId,
        }),
      }
    );
    expect(addResponse.status).toBe(201);

    const listResponse = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models/allowed/workspace`
    );
    expect(listResponse.status).toBe(200);
    expect(
      GetWorkspaceAllowedAdvancedModelsResponseBodySchema.parse(
        await listResponse.json()
      )
    ).toEqual({
      models: allAdvancedModels,
    });

    const deleteResponse = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models/allowed/workspace`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: advancedModel.providerId,
          modelId: advancedModel.modelId,
        }),
      }
    );
    expect(deleteResponse.status).toBe(204);

    const finalListResponse = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models/allowed/workspace`
    );
    expect(finalListResponse.status).toBe(200);
    expect(
      GetWorkspaceAllowedAdvancedModelsResponseBodySchema.parse(
        await finalListResponse.json()
      )
    ).toEqual({
      models: allAdvancedModels.filter(
        (model) =>
          model.providerId !== advancedModel.providerId ||
          model.modelId !== advancedModel.modelId
      ),
    });
  });
});

describe("POST/DELETE /api/w/:wId/advanced_models/allowed/users", () => {
  const advancedModel = AdvancedModelResource.getAdvancedModels()[0];

  it("allows admins to add, list, and remove user allowed models", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });

    const addResponse = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models/allowed/users`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.sId,
          providerId: advancedModel.providerId,
          modelId: advancedModel.modelId,
        }),
      }
    );
    expect(addResponse.status).toBe(201);

    const listResponse = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models/allowed/users`
    );
    expect(listResponse.status).toBe(200);
    expect(
      GetUserAllowedAdvancedModelsResponseBodySchema.parse(
        await listResponse.json()
      )
    ).toEqual({
      users: [
        {
          userId: user.sId,
          models: [
            {
              providerId: advancedModel.providerId,
              modelId: advancedModel.modelId,
            },
          ],
        },
      ],
    });

    const deleteResponse = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models/allowed/users`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.sId,
          providerId: advancedModel.providerId,
          modelId: advancedModel.modelId,
        }),
      }
    );
    expect(deleteResponse.status).toBe(204);
  });
});

describe("POST/DELETE /api/w/:wId/advanced_models/allowed/groups", () => {
  const advancedModel = AdvancedModelResource.getAdvancedModels()[0];

  it("allows admins to add, list, and remove group allowed models", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    const group = await GroupFactory.regularAuto(
      workspace,
      "Advanced models group"
    );
    const groupId = makeSId("group", {
      id: group.id,
      workspaceId: workspace.id,
    });

    const addResponse = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models/allowed/groups`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          providerId: advancedModel.providerId,
          modelId: advancedModel.modelId,
        }),
      }
    );
    expect(addResponse.status).toBe(201);

    const listResponse = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models/allowed/groups`
    );
    expect(listResponse.status).toBe(200);
    expect(
      GetGroupAllowedAdvancedModelsResponseBodySchema.parse(
        await listResponse.json()
      )
    ).toEqual({
      groups: [
        {
          groupId,
          models: [
            {
              providerId: advancedModel.providerId,
              modelId: advancedModel.modelId,
            },
          ],
        },
      ],
    });

    const deleteResponse = await honoApp.request(
      `/api/w/${workspace.sId}/advanced_models/allowed/groups`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          providerId: advancedModel.providerId,
          modelId: advancedModel.modelId,
        }),
      }
    );
    expect(deleteResponse.status).toBe(204);
  });
});
