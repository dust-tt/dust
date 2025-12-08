import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { untrustedFetch } from "@app/lib/egress/server";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const VANTA_BASE_URL = "https://api.vanta.com";

type VantaRequestOptions<T extends z.ZodTypeAny> = {
  path: string;
  schema: T;
  query?: Record<string, string>;
  authInfo?: AuthInfo;
};

export async function vantaGet<T extends z.ZodTypeAny>({
  path,
  schema,
  query,
  authInfo,
}: VantaRequestOptions<T>): Promise<Result<z.infer<T>, MCPError>> {
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

  const rawData = await response.json();
  const parseResult = schema.safeParse(rawData);

  if (!parseResult.success) {
    return new Err(
      new MCPError(`Invalid Vanta API response: ${parseResult.error.message}`)
    );
  }

  return new Ok(parseResult.data);
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
