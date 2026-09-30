/**
 * Remote MCP server URLs that always egress through the static IP proxy,
 * without requiring a workspace-verified domain.
 *
 * Only add fixed, non-user-defined endpoints here (official hosted MCP
 * servers). User-controlled URLs must continue to go through verified-domain
 * gating so the static egress IP cannot be weaponized.
 */
export const STATIC_IP_FORCED_REMOTE_MCP_URLS: readonly string[] = [
  "https://bigquery.googleapis.com/mcp",
];

function normalizeMcpUrl(url: URL): string {
  const pathname = url.pathname.replace(/\/+$/, "") || "";
  return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}`;
}

/**
 * Returns true when `url` matches a hardcoded remote MCP URL that must always
 * use the static IP proxy.
 */
export function isStaticIpForcedRemoteMcpUrl(url: string | URL): boolean {
  let parsed: URL;
  try {
    parsed = url instanceof URL ? url : new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  const normalized = normalizeMcpUrl(parsed);
  return STATIC_IP_FORCED_REMOTE_MCP_URLS.some((allowed) => {
    try {
      return normalizeMcpUrl(new URL(allowed)) === normalized;
    } catch {
      return false;
    }
  });
}
