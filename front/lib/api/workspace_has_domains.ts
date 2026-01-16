import type { Authenticator } from "@app/lib/auth";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { isHostUnderDomain, isIpAddress } from "@app/types";

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

  const verifiedDomains = await WorkspaceHasDomainModel.findAll({
    attributes: ["domain"],
    where: { workspaceId: auth.getNonNullableWorkspace().id },
  });

  return verifiedDomains.some((d) => isHostUnderDomain(host, d.domain));
}
