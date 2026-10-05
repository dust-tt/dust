import type { BigQueryOptions } from "@google-cloud/bigquery";
import type { Interceptor } from "@google-cloud/common/build/src/service-object";
import type { DecorateRequestOptions } from "@google-cloud/common/build/src/util";
import { HttpsProxyAgent } from "https-proxy-agent";

// BigQueryOptions is not typed with Service interceptors, but the constructor
// forwards them to @google-cloud/common Service (same path Snowflake uses via
// SDK-native proxy fields; BigQuery needs an interceptor for teeny-request).
type BigQueryOptionsWithInterceptors = BigQueryOptions & {
  interceptors_?: Interceptor[];
};

/**
 * Canonical Google OAuth2 token endpoints used by service-account JWT exchange.
 * gtoken (google-auth-library) hardcodes the v4 URL; modern service-account JSON
 * uses oauth2.googleapis.com. Both are Google-owned.
 */
export const GOOGLE_OAUTH_TOKEN_URIS = [
  "https://oauth2.googleapis.com/token",
  "https://www.googleapis.com/oauth2/v4/token",
] as const;

export type GoogleOAuthTokenUri = (typeof GOOGLE_OAUTH_TOKEN_URIS)[number];

/**
 * Returns true when `tokenUri` is one of Google's canonical OAuth token endpoints.
 * Prevents credential-controlled token exchange from targeting arbitrary URLs when
 * Dust routes the request through the static IP proxy.
 */
export function isGoogleOAuthTokenUri(
  tokenUri: string
): tokenUri is GoogleOAuthTokenUri {
  return (GOOGLE_OAUTH_TOKEN_URIS as readonly string[]).includes(tokenUri);
}

/**
 * Pins a service-account `token_uri` to a Google canonical endpoint.
 * Throws when the value is missing or not an allowlisted Google token URL.
 */
export function pinGoogleOAuthTokenUri(tokenUri: string): GoogleOAuthTokenUri {
  if (!isGoogleOAuthTokenUri(tokenUri)) {
    throw new Error(
      `Invalid BigQuery credentials: token_uri must be a Google OAuth token endpoint ` +
        `(got ${JSON.stringify(tokenUri)})`
    );
  }
  return tokenUri;
}

/**
 * Builds `@google-cloud/bigquery` options that route API traffic and OAuth token
 * minting through Dust's static IP proxy when `PROXY_*` env vars are configured
 * (same egress path as Snowflake).
 *
 * - REST API: teeny-request honors `reqOpts.proxy` via an interceptor.
 * - Token minting: google-auth-library/gtoken uses the JWT transporter; we set
 *   `clientOptions.transporterOptions.agent` so the token POST also uses the proxy.
 */
export function withBigQueryStaticIpProxy(
  options: BigQueryOptionsWithInterceptors
): BigQueryOptionsWithInterceptors {
  const proxyUrl = getStaticIpProxyUrl();
  if (!proxyUrl) {
    return options;
  }

  const proxyInterceptor: Interceptor = {
    request(reqOpts): DecorateRequestOptions {
      reqOpts.proxy = proxyUrl;
      return reqOpts as DecorateRequestOptions;
    },
  };

  const existingClientOptions = options.clientOptions ?? {};
  const existingTransporterOptions =
    "transporterOptions" in existingClientOptions &&
    existingClientOptions.transporterOptions
      ? existingClientOptions.transporterOptions
      : {};

  return {
    ...options,
    interceptors_: [...(options.interceptors_ ?? []), proxyInterceptor],
    clientOptions: {
      ...existingClientOptions,
      transporterOptions: {
        ...existingTransporterOptions,
        agent: new HttpsProxyAgent(proxyUrl),
      },
    },
  };
}

export function getStaticIpProxyUrl(): string | undefined {
  const host = process.env.PROXY_HOST;
  const port = process.env.PROXY_PORT;
  const user = process.env.PROXY_USER_NAME;
  const password = process.env.PROXY_USER_PASSWORD;

  if (!host || !port || !user || !password) {
    return undefined;
  }

  return `http://${user}:${password}@${host}:${port}`;
}

/**
 * Returns an `HttpsProxyAgent` for google-auth-library transporters when PROXY_*
 * is configured; otherwise `undefined` (direct egress for local/unproxied dev).
 */
export function getStaticIpProxyAgent(): HttpsProxyAgent<string> | undefined {
  const proxyUrl = getStaticIpProxyUrl();
  if (!proxyUrl) {
    return undefined;
  }
  return new HttpsProxyAgent(proxyUrl);
}
