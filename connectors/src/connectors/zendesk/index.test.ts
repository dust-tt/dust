import { ZendeskConnectorManager } from "@connectors/connectors/zendesk";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  import("@connectors/connectors/zendesk/lib/zendesk_access_token"),
  () => ({
    getZendeskSubdomainAndAccessToken: vi.fn(async () => ({
      accessToken: "access-token",
      subdomain: "example",
    })),
  })
);

describe("ZendeskConnectorManager", () => {
  it("returns a missing rights error when Zendesk forbids listing brands", async () => {
    const connector = await ConnectorResource.makeNew(
      "zendesk",
      {
        connectionId: "connection-id",
        dataSourceId: "data-source-id",
        workspaceAPIKey: "workspace-api-key",
        workspaceId: "workspace-id",
      },
      {
        customFieldsConfig: [],
        hideCustomerDetails: false,
        organizationTagsToExclude: null,
        organizationTagsToInclude: null,
        rateLimitTransactionsPerSecond: null,
        retentionPeriodDays: 180,
        subdomain: "example",
        syncUnresolvedTickets: false,
        ticketTagsToExclude: null,
        ticketTagsToInclude: null,
      }
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    );

    const result = await new ZendeskConnectorManager(
      connector.id
    ).retrievePermissions({
      filterPermission: null,
      parentInternalId: null,
      viewType: "all",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("CONNECTOR_OAUTH_USER_MISSING_RIGHTS");
      expect(result.error.message).toBe(
        "Dust cannot list Zendesk brands because the connected user lacks the required permissions. Re-authorize Zendesk with an admin account."
      );
    }
  });
});
