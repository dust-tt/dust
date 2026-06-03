import type { Authenticator } from "@app/lib/auth";
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

export async function computeUseStaticIpProxy(
  auth: Authenticator,
  tokenEndpoint: string | undefined
): Promise<boolean> {
  if (!tokenEndpoint) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(tokenEndpoint);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  return isHostUnderVerifiedDomain(auth, url.hostname);
}
