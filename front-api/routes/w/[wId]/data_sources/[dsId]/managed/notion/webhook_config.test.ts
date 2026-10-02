import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NOTION_WORKSPACE_ID = "notion-workspace-id";
const SIGNING_SECRET = "notion-signing-secret";

function getWebhookConfig(workspace: { sId: string }, dsId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/data_sources/${dsId}/managed/notion/webhook_config`
  );
}

async function createNotionDataSource(
  workspace: WorkspaceType,
  systemSpace: SpaceResource
): Promise<DataSourceResource> {
  const { dataSource } = await DataSourceViewFactory.fromConnector(
    workspace,
    systemSpace,
    "notion"
  );
  await dataSource.setConnectorId("1");
  return dataSource;
}

describe("GET /api/w/:wId/data_sources/:dsId/managed/notion/webhook_config", () => {
  let getNotionWorkspaceId: ReturnType<typeof vi.spyOn>;
  let getWebhookRouterEntry: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getNotionWorkspaceId = vi
      .spyOn(ConnectorsAPI.prototype, "getNotionWorkspaceId")
      .mockResolvedValue(new Ok({ notionWorkspaceId: NOTION_WORKSPACE_ID }));
    getWebhookRouterEntry = vi
      .spyOn(ConnectorsAPI.prototype, "getWebhookRouterEntry")
      .mockResolvedValue(
        new Ok({
          provider: "notion",
          providerWorkspaceId: NOTION_WORKSPACE_ID,
          signingSecret: SIGNING_SECRET,
          regions: ["us-central1"],
        })
      );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the webhook config to a workspace admin", async () => {
    const { workspace, systemSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const dataSource = await createNotionDataSource(workspace, systemSpace);

    const response = await getWebhookConfig(workspace, dataSource.sId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      webhookUrl: `https://webhook-router.dust.tt/notion/${NOTION_WORKSPACE_ID}`,
      verificationToken: SIGNING_SECRET,
    });
  });

  it("returns 403 to a non-admin member without querying connectors", async () => {
    const { workspace, systemSpace } = await createPrivateApiMockRequest({
      role: "user",
    });
    const dataSource = await createNotionDataSource(workspace, systemSpace);

    const response = await getWebhookConfig(workspace, dataSource.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "data_source_auth_error",
        message:
          "Only workspace admins can access the Notion webhook configuration.",
      },
    });
    expect(getNotionWorkspaceId).not.toHaveBeenCalled();
    expect(getWebhookRouterEntry).not.toHaveBeenCalled();
  });
});
