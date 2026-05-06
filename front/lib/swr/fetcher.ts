import config from "@app/lib/api/config";
import { BUILD_DATE, COMMIT_HASH } from "@app/lib/commit-hash";
import { clientFetch } from "@app/lib/egress/client";
import { isNavigationLocked } from "@app/lib/navigation-lock";
import datadogLogger from "@app/logger/datadogLogger";
import { isAPIErrorResponse } from "@app/types/error";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import {
  FORCE_RELOAD_INTERVAL_MS,
  FORCE_RELOAD_SESSION_KEY,
} from "@dust-tt/sparkle";

const addClientVersionHeaders = (headers: HeadersInit = {}): HeadersInit => ({
  ...headers,
  "X-Commit-Hash": COMMIT_HASH,
  "X-Build-Date": BUILD_DATE,
});

const makeResHandler =
  <T>({
    parseResponse,
    redirectOnUnauthenticated,
  }: {
    parseResponse: (res: Response) => Promise<T>;
    redirectOnUnauthenticated: boolean;
  }) =>
  async (res: Response): Promise<T> => {
    if (res.headers.get("X-Reload-Required") === "true") {
      const lastReloadMs = sessionStorage.getItem(FORCE_RELOAD_SESSION_KEY);
      const nowMs = Date.now();
      const lastMs = lastReloadMs !== null ? Number(lastReloadMs) : Number.NaN;
      const shouldReload =
        (!Number.isFinite(lastMs) ||
          nowMs - lastMs > FORCE_RELOAD_INTERVAL_MS) &&
        !isNavigationLocked();
      if (shouldReload) {
        datadogLogger.info(
          {
            commitHash: COMMIT_HASH,
            url: res.url,
            statusCode: res.status,
          },
          "[fetcher] Force client reload - ignored"
        );
        sessionStorage.setItem(FORCE_RELOAD_SESSION_KEY, nowMs.toString());
        // TODO - reenable once clients cache are cleaned - window.location.reload();
        // Return a never-resolving promise to prevent SWR from processing.
        return new Promise<T>(() => {});
      }
    }

    if (res.status >= 300) {
      const errorText = await res.text();
      datadogLogger.error(
        {
          url: res.url,
          statusCode: res.status,
          errorText:
            errorText.length > 1000 ? errorText.substring(0, 1000) : errorText,
        },
        "Error returned by the front API"
      );

      const parseRes = safeParseJSON(errorText);
      if (parseRes.isOk()) {
        if (isAPIErrorResponse(parseRes.value)) {
          if (
            parseRes.value.error.type === "not_authenticated" &&
            redirectOnUnauthenticated
          ) {
            const returnTo =
              window.location.pathname !== "/"
                ? `?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
                : "";
            window.location.href = `${config.getApiBaseUrl()}/api/workos/login${returnTo}`;
            // Return a never-resolving promise to prevent SWR from processing.
            return new Promise<T>(() => {});
          }
          throw parseRes.value;
        }
      }

      throw new Error(errorText);
    }
    return parseResponse(res);
  };

const resHandler = makeResHandler<any>({
  parseResponse: (res) => res.json(),
  redirectOnUnauthenticated: true,
});
const textResHandler = makeResHandler<string>({
  parseResponse: (res) => res.text(),
  redirectOnUnauthenticated: true,
});
const nonRedirectingResHandler = makeResHandler<any>({
  parseResponse: (res) => res.json(),
  redirectOnUnauthenticated: false,
});

export type FetcherFn = (url: string, init?: RequestInit) => Promise<any>;

export type FetcherTextFn = (
  url: string,
  init?: RequestInit
) => Promise<string>;

export type FetcherWithBodyFn = (
  args: [url: string, body: object, method: string],
  init?: RequestInit
) => Promise<any>;

export const fetcher: FetcherFn = async (url, init) => {
  const res = await clientFetch(url, {
    ...init,
    headers: addClientVersionHeaders(init?.headers),
  });
  return resHandler(res);
};

export const fetcherText: FetcherTextFn = async (url, init) => {
  const res = await clientFetch(url, {
    ...init,
    headers: addClientVersionHeaders(init?.headers),
  });
  return textResHandler(res);
};

// Throws on `not_authenticated` instead of redirecting to login. Use when a
// 401 should leave the page in place (e.g. a stale `dust-has-session` cookie
// on the public website should not bounce the visitor through login).
export const nonRedirectingFetcher: FetcherFn = async (url, init) => {
  const res = await clientFetch(url, {
    ...init,
    headers: addClientVersionHeaders(init?.headers),
  });
  return nonRedirectingResHandler(res);
};

export const fetcherWithBody: FetcherWithBodyFn = async (
  [url, body, method],
  init
) => {
  const res = await clientFetch(url, {
    ...init,
    method,
    headers: addClientVersionHeaders({
      ...init?.headers,
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });

  return resHandler(res);
};
