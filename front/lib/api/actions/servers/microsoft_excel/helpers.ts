import { getDriveItemEndpoint } from "@app/lib/actions/mcp_internal_actions/servers/microsoft/utils";
import type { Client } from "@microsoft/microsoft-graph-client";

// Session management for persistent Excel sessions
interface ExcelSession {
  sessionId: string;
  expiresAt: number;
}

// Cache key format: "userId:driveItemId" to prevent cross-user session sharing
const sessionCache = new Map<string, ExcelSession>();

/**
 * Create or get a persistent session for Excel operations
 */
export async function getExcelSession(
  client: Client,
  driveItemId: string,
  clientId: string
): Promise<string | null> {
  try {
    // Validate clientId is provided
    if (!clientId || clientId.trim() === "") {
      throw new Error("Client ID is required for session management");
    }

    // Create composite cache key to prevent cross-user session sharing
    const cacheKey = `${clientId}:${driveItemId}`;

    // Check cache
    const cached = sessionCache.get(cacheKey);
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        return cached.sessionId;
      }
      // Remove expired entry
      sessionCache.delete(cacheKey);
    }

    // Create new persistent session
    const endpoint = await getDriveItemEndpoint(driveItemId);
    const response = await client
      .api(`${endpoint}/workbook/createSession`)
      .post({
        persistChanges: true,
      });

    const sessionId = response.id;
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    sessionCache.set(cacheKey, { sessionId, expiresAt });

    return sessionId;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
  } catch (err) {
    // Session creation failed, proceed without session
    return null;
  }
}

/**
 * Make request with session header if available
 */
export async function makeExcelRequest<T>(
  client: Client,
  driveItemId: string,
  clientId: string,
  path: string,
  method: "get" | "post" | "patch" = "get",
  body?: unknown
): Promise<T> {
  const sessionId = await getExcelSession(client, driveItemId, clientId);
  const api = client.api(path);

  if (sessionId) {
    api.header("workbook-session-id", sessionId);
  }

  switch (method) {
    case "get":
      return api.get();
    case "post":
      return api.post(body);
    case "patch":
      return api.patch(body);
    default:
      throw new Error(`Unsupported method: ${method}`);
  }
}
