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

type RevealEdgeeGatewayApiKeyParams = EdgeeOrganizationAccess & {
  apiKeyId: string;
};

export type EdgeeGatewayApiKey = {
  apiKeyId: string;
  apiKey: string;
};

const CreatedApiKeyResponseSchema = z.object({
  id: z.string(),
});

const RevealedApiKeyResponseSchema = z.object({
  key: z.string(),
});

/**
 * @cc [owner:pmilliotte,label:security] edgee-console-errors-never-carry-secrets
 * Errors returned by this client MUST NOT include the Edgee response body nor the admin token:
 * the body of a key reveal carries the gateway key secret.
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

  const created = CreatedApiKeyResponseSchema.safeParse(res.value);
  if (!created.success) {
    return new Err(
      new Error("Edgee Console API returned an unexpected api key shape")
    );
  }

  const apiKeyId = created.data.id;
  const revealRes = await revealEdgeeGatewayApiKey({ ...access, apiKeyId });
  if (revealRes.isErr()) {
    await deleteEdgeeGatewayApiKey({ ...access, apiKeyId });
    return revealRes;
  }

  return new Ok({ apiKeyId, apiKey: revealRes.value });
}

// Edgee leaves the secret out of the creation response and reveals it once, on this call only.
async function revealEdgeeGatewayApiKey({
  apiKeyId,
  ...access
}: RevealEdgeeGatewayApiKeyParams): Promise<Result<string, Error>> {
  const res = await callConsoleApi(
    access,
    `/api_keys/${encodeURIComponent(apiKeyId)}/reveal`,
    { method: "GET" }
  );
  if (res.isErr()) {
    return res;
  }

  const revealed = RevealedApiKeyResponseSchema.safeParse(res.value);
  if (!revealed.success) {
    return new Err(
      new Error("Edgee Console API returned an unexpected revealed key shape")
    );
  }

  return new Ok(revealed.data.key);
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
