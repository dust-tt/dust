import { EnvironmentConfig } from "@app/types/shared/utils/config";
import type { BigQueryOptions } from "@google-cloud/bigquery";
import type { Interceptor } from "@google-cloud/common/build/src/service-object";
import type { DecorateRequestOptions } from "@google-cloud/common/build/src/util";

type BigQueryOptionsWithInterceptors = BigQueryOptions & {
  interceptors_?: Interceptor[];
};

/**
 * Builds BigQuery client options that route API traffic through Dust's static
 * IP proxy when configured — same allowlisted egress Snowflake uses.
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

function getStaticIpProxyUrl(): string | undefined {
  const host = EnvironmentConfig.getOptionalEnvVariable("PROXY_HOST");
  const port = EnvironmentConfig.getOptionalEnvVariable("PROXY_PORT");
  const user = EnvironmentConfig.getOptionalEnvVariable("PROXY_USER_NAME");
  const password = EnvironmentConfig.getOptionalEnvVariable(
    "PROXY_USER_PASSWORD"
  );

  if (!host || !port || !user || !password) {
    return undefined;
  }

  return `http://${user}:${password}@${host}:${port}`;
}
