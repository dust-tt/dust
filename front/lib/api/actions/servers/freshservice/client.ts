import { MCPError } from "@app/lib/actions/mcp_errors";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

/**
 * Normalize Freshservice domain for API calls.
 * Handles various input formats: full URLs, domains with protocol, or just subdomain.
 */
export function normalizeApiDomain(freshserviceDomainRaw: string): string {
  // Remove protocol, trailing slash, and trim whitespace
  const domain = freshserviceDomainRaw
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  if (!domain) {
    throw new Error("Invalid Freshservice domain format");
  }

  // If it already contains a dot (likely a full domain), use as-is
  if (domain.includes(".")) {
    return domain;
  }

  // If it's just the subdomain, add .freshservice.com
  return `${domain}.freshservice.com`;
}

/**
 * Freshservice API client for making authenticated requests.
 */
export class FreshserviceClient {
  private accessToken: string;
  private freshserviceDomain: string;

  constructor(accessToken: string, freshserviceDomain: string) {
    this.accessToken = accessToken;
    this.freshserviceDomain = freshserviceDomain;
  }

  /**
   * Make an API request to Freshservice.
   */
  async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T | null> {
    const apiDomain = normalizeApiDomain(this.freshserviceDomain);
    const url = `https://${apiDomain}/api/v2/${endpoint}`;

    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");

    if (contentLength === "0" || !contentType) {
      return null;
    }

    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text() as unknown as T;
  }

  /**
   * Get the normalized API domain for building URLs.
   */
  getApiDomain(): string {
    return normalizeApiDomain(this.freshserviceDomain);
  }
}

/**
 * Create a Freshservice client from auth info.
 */
export function createFreshserviceClient(
  authInfo: AuthInfo | undefined
): Result<FreshserviceClient, MCPError> {
  if (!authInfo?.token) {
    return new Err(
      new MCPError(
        "Authentication required. Please connect your Freshservice account."
      )
    );
  }

  const freshserviceDomain = authInfo.extra?.freshservice_domain as
    | string
    | undefined;
  if (!freshserviceDomain) {
    return new Err(
      new MCPError(
        "Freshservice domain URL not configured. Please reconnect your Freshservice account."
      )
    );
  }

  return new Ok(new FreshserviceClient(authInfo.token, freshserviceDomain));
}
