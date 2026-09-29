import type { BigQueryOptions } from "@google-cloud/bigquery";
import type { Interceptor } from "@google-cloud/common/build/src/service-object";
import type { DecorateRequestOptions } from "@google-cloud/common/build/src/util";

// BigQueryOptions is not typed with Service interceptors, but the constructor
// forwards them to @google-cloud/common Service (same path Snowflake uses via
// SDK-native proxy fields; BigQuery needs an interceptor for teeny-request).
type BigQueryOptionsWithInterceptors = BigQueryOptions & {
  interceptors_?: Interceptor[];
};

/**
 * Builds `@google-cloud/bigquery` options that route API traffic through Dust's
 * static IP proxy when `PROXY_*` env vars are configured (same egress path as
 * Snowflake). teeny-request honors `reqOpts.proxy` via an interceptor.
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

  return {
    ...options,
    interceptors_: [...(options.interceptors_ ?? []), proxyInterceptor],
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
