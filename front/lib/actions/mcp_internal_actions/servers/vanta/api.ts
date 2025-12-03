import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { untrustedFetch } from "@app/lib/egress";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const VANTA_BASE_URL = "https://api.vanta.com";

type VantaRequestOptions = {
  path: string;
  query?: Record<string, string>;
  authInfo?: AuthInfo;
};

export async function vantaGet<T = unknown>({
  path,
  query,
  authInfo,
}: VantaRequestOptions): Promise<Result<T, MCPError>> {
  const token = authInfo?.token;
  if (!token) {
    return new Err(
      new MCPError(
        "Missing Vanta access token. Connect the Vanta account to this workspace first.",
        { tracked: false }
      )
    );
  }

  const url = buildUrl(VANTA_BASE_URL, path, query);

  const response = await untrustedFetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    return new Err(
      new MCPError(
        `Vanta API error (${response.status}): ${response.statusText}`
      )
    );
  }

  const payload = await response.json();
  return new Ok(payload as T);
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string>
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, baseUrl);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  return url.toString();
}
