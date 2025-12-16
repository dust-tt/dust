import {
  getAvailabilityOfInternalMCPServerByName,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  connectToMCPServer,
  extractMetadataFromServerVersion,
  extractMetadataFromTools,
} from "@app/lib/actions/mcp_metadata";
import type { Authenticator } from "@app/lib/auth";
import { cacheWithRedis } from "@app/lib/utils/cache";
import { isDevelopment } from "@app/types";

const METADATA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Getting the metadata is a relatively long operation, so we cache it for 5 minutes
// as internal servers are not expected to change often.
// In any case, when actually running the action, the metadata will be fetched from the MCP server.
export const getCachedMetadata = cacheWithRedis(
  async (auth: Authenticator, id: string) => {
    console.log(">> getCachedMetadata for MCP Server ID:", id);
    const s = await connectToMCPServer(auth, {
      params: {
        type: "mcpServerId",
        mcpServerId: id,
        oAuthUseCase: null,
      },
    });

    if (s.isErr()) {
      return null;
    }

    const mcpClient = s.value;
    const md = extractMetadataFromServerVersion(mcpClient.getServerVersion());

    const metadata = {
      ...md,
      tools: extractMetadataFromTools(
        (await mcpClient.listTools()).tools
      ) as any,
      availability: isInternalMCPServerName(md.name)
        ? getAvailabilityOfInternalMCPServerByName(md.name)
        : "manual",
    };

    await mcpClient.close();

    return metadata;
  },
  (_auth: Authenticator, id: string) => `internal-mcp-server-metadata-${id}`,
  {
    ttlMs: isDevelopment() ? 1000 : METADATA_CACHE_TTL_MS,
  }
);
