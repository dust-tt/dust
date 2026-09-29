import { isStaticIpForcedRemoteMcpUrl } from "@app/lib/api/mcp/static_ip_forced_urls";
import type { Authenticator } from "@app/lib/auth";
import { isWorkspaceUsingStaticIP } from "@app/lib/misc";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  isHostUnderDomain,
  isIpAddress,
} from "@app/types/shared/utils/url_utils";

/**
 * Check if a host is under any verified domain for the workspace.
 * Used for MCP static IP egress routing.
 * Rejects IP address literals for security (only domain names are matched).
 */
export async function isHostUnderVerifiedDomain(
  auth: Authenticator,
  host: string
): Promise<boolean> {
  if (isIpAddress(host)) {
    return false;
  }

  const workspace = await WorkspaceResource.fetchById(
    auth.getNonNullableWorkspace().sId
  );
  if (!workspace) {
    return false;
  }

  const verifiedDomains = await workspace.getVerifiedDomains();

  return verifiedDomains.some((d) => isHostUnderDomain(host, d.domain));
}

// Decide whether MCP traffic for `url` should egress through the static IP proxy.
// Mirrors the MCP tool-call routing decision in `lib/actions/mcp_metadata.ts`, with one
// added gate (we never route a plaintext endpoint through the static IP):
//   1. Legacy hardcoded workspace check.
//   2. Hardcoded allowlist of official remote MCP URLs (e.g. Google BigQuery MCP).
//   3. Domain-based check: the URL host (HTTPS only) is under a verified domain.
//
// `relatedMcpServerUrl` covers OAuth flows where `url` is the token endpoint but the
// MCP server itself is on the hardcoded allowlist (via the OAuth `resource` field).
export async function shouldUseStaticIpProxy(
  auth: Authenticator,
  {
    url,
    relatedMcpServerUrl,
  }: {
    url?: string;
    relatedMcpServerUrl?: string;
  }
): Promise<boolean> {
  if (isWorkspaceUsingStaticIP(auth.getNonNullableWorkspace())) {
    return true;
  }

  if (
    relatedMcpServerUrl &&
    isStaticIpForcedRemoteMcpUrl(relatedMcpServerUrl)
  ) {
    return true;
  }

  if (!url) {
    return false;
  }

  if (isStaticIpForcedRemoteMcpUrl(url)) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  return isHostUnderVerifiedDomain(auth, parsed.hostname);
}
