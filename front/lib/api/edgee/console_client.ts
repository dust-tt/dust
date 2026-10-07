import { trustedFetch } from "@app/lib/egress/server";
import { EDGEE_CONSOLE_API_URL } from "@app/types/gateways/edgee";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

export type EdgeeOrganizationAccess = {
  adminToken: string;
  organizationId: string;
};

export type CreateEdgeeGatewayApiKeyParams = EdgeeOrganizationAccess & {
  name: string;
  // Contact address Edgee attaches to the key, `null` when the caller has none.
  email: string | null;
};

export type DeleteEdgeeGatewayApiKeyParams = EdgeeOrganizationAccess & {
  apiKeyId: string;
};

export type EdgeeGatewayApiKey = {
  apiKeyId: string;
  apiKey: string;
};

const CreatedApiKeyResponseSchema = z.object({
  id: z.string(),
  key: z.string(),
});

/**
 * @cc [owner:pmilliotte,label:security] edgee-console-errors-never-carry-secrets
 * Errors returned by this client MUST NOT include the Edgee response body nor the admin token:
 * the body of a key creation carries the gateway key secret.
 */
async function callConsoleApi(
  { adminToken, organizationId }: EdgeeOrganizationAccess,
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown }
): Promise<Result<unknown, Error>> {
  const url = `${EDGEE_CONSOLE_API_URL}/v1/organizations/${encodeURIComponent(organizationId)}${path}`;

  try {
    const response = await trustedFetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    if (!response.ok) {
      return new Err(
        new Error(
          `Edgee Console API ${init.method} ${path} failed with status ${response.status}`
        )
      );
    }

    const text = await response.text();
    return new Ok(text ? JSON.parse(text) : null);
  } catch (err) {
    return new Err(
      new Error(
        `Edgee Console API ${init.method} ${path} failed: ${normalizeError(err).message}`
      )
    );
  }
}

// Listing the organization's gateway keys proves the token can manage them, which is all a
// connection needs.
export async function checkEdgeeOrganizationAccess(
  access: EdgeeOrganizationAccess
): Promise<Result<void, Error>> {
  const res = await callConsoleApi(access, "/api_keys", { method: "GET" });
  return res.isErr() ? res : new Ok(undefined);
}

export async function createEdgeeGatewayApiKey({
  name,
  email,
  ...access
}: CreateEdgeeGatewayApiKeyParams): Promise<Result<EdgeeGatewayApiKey, Error>> {
  const res = await callConsoleApi(access, "/api_keys", {
    method: "POST",
    body: { name, type: "api", ...(email ? { email } : {}) },
  });
  if (res.isErr()) {
    return res;
  }

  const parsed = CreatedApiKeyResponseSchema.safeParse(res.value);
  if (!parsed.success) {
    return new Err(
      new Error("Edgee Console API returned an unexpected api key shape")
    );
  }

  return new Ok({ apiKeyId: parsed.data.id, apiKey: parsed.data.key });
}

export async function deleteEdgeeGatewayApiKey({
  apiKeyId,
  ...access
}: DeleteEdgeeGatewayApiKeyParams): Promise<Result<void, Error>> {
  const res = await callConsoleApi(
    access,
    `/api_keys/${encodeURIComponent(apiKeyId)}`,
    { method: "DELETE" }
  );
  return res.isErr() ? res : new Ok(undefined);
}
