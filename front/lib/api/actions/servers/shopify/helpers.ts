import { MCPError } from "@app/lib/actions/mcp_errors";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

export function getShopDomain(authInfo?: AuthInfo): Result<string, MCPError> {
  // Preview: no Shopify OAuth provider yet, so the shop domain is read from the
  // `X-Shopify-Shop` custom header set at setup. It will come from the OAuth
  // connection once that lands.
  const parsed = z
    .object({ "X-Shopify-Shop": z.string().trim().min(1) })
    .safeParse(authInfo?.extra?.customHeaders);
  if (!parsed.success) {
    return new Err(
      new MCPError(
        "Shopify shop domain not found. Set it as an `X-Shopify-Shop` custom header (e.g. my-store.myshopify.com)."
      )
    );
  }
  // Accept both bare domains and full URLs by prepending a scheme so the URL
  // parser can extract the hostname in either case.
  const raw = parsed.data["X-Shopify-Shop"];
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let host: string;
  try {
    host = new URL(withScheme).hostname;
  } catch {
    return new Err(
      new MCPError(
        "Invalid Shopify shop domain. Use the store's myshopify.com domain (e.g. my-store.myshopify.com)."
      )
    );
  }
  if (!host.endsWith(".myshopify.com")) {
    return new Err(
      new MCPError(
        "Invalid Shopify shop domain. Use the store's myshopify.com domain (e.g. my-store.myshopify.com)."
      )
    );
  }
  return new Ok(host);
}
