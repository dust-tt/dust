import { makeScript } from "@app/scripts/helpers";
import type { SyncAuthWarningSeedAsset } from "@app/scripts/seed/factories";
import {
  createSeedContext,
  seedRemoteMCPSyncAuthWarning,
} from "@app/scripts/seed/factories";

/**
 * Fake remote MCP servers stuck in the sync-auth-expired state.
 * Discovery against these hosts fails on purpose so Refresh exercises the stored-authorization
 * fallback in ConnectMCPServerDialog.
 */
const SERVERS: SyncAuthWarningSeedAsset[] = [
  {
    name: "NetSuite Sync Warning",
    description:
      "Seeded NetSuite-like remote MCP server with expired shared authentication.",
    url: "https://mcp.netsuite.example.invalid/mcp",
    oAuthUseCase: "platform_actions",
    lastError: "401 Unauthorized",
  },
  {
    name: "NetSuite Sync Warning Personal",
    description:
      "Seeded NetSuite-like remote MCP server with expired personal-setup authentication.",
    url: "https://mcp.netsuite-personal.example.invalid/mcp",
    oAuthUseCase: "personal_actions",
    lastError: "token expired",
  },
];

makeScript({}, async ({ execute }, logger) => {
  const ctx = await createSeedContext({ execute, logger });

  for (const asset of SERVERS) {
    const view = await seedRemoteMCPSyncAuthWarning(ctx, asset);
    logger.info(
      {
        name: asset.name,
        oAuthUseCase: asset.oAuthUseCase,
        viewSId: view?.sId ?? null,
      },
      "MCP sync-auth-warning seed ready"
    );
  }
});
