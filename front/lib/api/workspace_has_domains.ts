import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { isStaticIpForcedRemoteMcpUrl } from "@app/lib/api/mcp/static_ip_forced_urls";
import { removeWorkOSOrganizationDomain } from "@app/lib/api/workos/organization_primitives";
import type { Authenticator } from "@app/lib/auth";
import { isWorkspaceUsingStaticIP } from "@app/lib/misc";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
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

function emitDomainRemovedAuditLogEvent(auth: Authenticator, domain: string) {
  void emitAuditLogEvent({
    auth,
    action: "domain.removed",
    targets: [buildAuditLogTarget("workspace", auth.getNonNullableWorkspace())],
    context: getAuditLogContext(auth),
    metadata: { domain },
  });
}

/**
 * @cc [owner:tdraier,label:security;product] domain-removal-revokes-locally
 * The workspace's local `workspace_has_domains` row for `domain` MUST be deleted before the domain
 * is removed from WorkOS, so auto-join stops honoring the domain even if the WorkOS call fails or
 * its `organization.updated` webhook is delayed or never delivered.
 */
/**
 * @cc [owner:tdraier,label:audit-logging;security] domain-removal-audited
 * A `domain.removed` audit event MUST be emitted exactly once whenever the local row is deleted
 * (regardless of the WorkOS outcome), or, when no local row existed, once the WorkOS removal
 * succeeds. Callers MUST NOT emit their own `domain.removed` event.
 */
export async function removeWorkspaceDomain(
  auth: Authenticator,
  { domain }: { domain: string }
): Promise<Result<void, Error>> {
  const owner = auth.getNonNullableWorkspace();
  const workspace = await WorkspaceResource.fetchById(owner.sId);
  if (!workspace) {
    return new Err(new Error(`Workspace not found: ${owner.sId}`));
  }

  const localDomains = await workspace.getVerifiedDomains();
  const revokedLocally = localDomains.some((d) => d.domain === domain);
  if (revokedLocally) {
    const deleteRes = await workspace.deleteDomain({ domain });
    if (deleteRes.isErr()) {
      return deleteRes;
    }
    emitDomainRemovedAuditLogEvent(auth, domain);
  }

  const removeRes = await removeWorkOSOrganizationDomain(owner, { domain });
  if (removeRes.isOk() && !revokedLocally) {
    emitDomainRemovedAuditLogEvent(auth, domain);
  }

  return removeRes;
}
