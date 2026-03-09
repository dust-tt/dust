import config from "@app/lib/api/config";
import { BUILD_DATE, COMMIT_HASH } from "@app/lib/commit-hash";
import { clientFetch } from "@app/lib/egress/client";
import { isNavigationLocked } from "@app/lib/navigation-lock";
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

const resHandler = async (res: Response) => {
  if (res.headers.get("X-Reload-Required") === "true") {
    const lastReloadMs = sessionStorage.getItem(FORCE_RELOAD_SESSION_KEY);
    const nowMs = Date.now();
    const lastMs = lastReloadMs !== null ? Number(lastReloadMs) : Number.NaN;
    const shouldReload =
      (!Number.isFinite(lastMs) || nowMs - lastMs > FORCE_RELOAD_INTERVAL_MS) &&
      !isNavigationLocked();
    if (shouldReload) {
      sessionStorage.setItem(FORCE_RELOAD_SESSION_KEY, nowMs.toString());
      window.location.reload();
      // Return a never-resolving promise to prevent SWR from processing.
      return new Promise(() => {});
    }
  }

  if (res.status >= 300) {
    const errorText = await res.text();
    console.error(
      "Error returned by the front API: ",
      res.status,
      res.headers,
      errorText
    );

    const parseRes = safeParseJSON(errorText);
    if (parseRes.isOk()) {
      if (isAPIErrorResponse(parseRes.value)) {
        if (parseRes.value.error.type === "not_authenticated") {
          const returnTo =
            window.location.pathname !== "/"
              ? `?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
              : "";
          window.location.href = `${config.getApiBaseUrl()}/api/workos/login${returnTo}`;
          // Return a never-resolving promise to prevent SWR from processing.
          return new Promise(() => {});
        }
        throw parseRes.value;
      }
    }

    throw new Error(errorText);
  }
  return res.json();
};

export type FetcherFn = (url: string, init?: RequestInit) => Promise<any>;

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

type UrlsAndOptions = { url: string; options: RequestInit };

export const fetcherMultiple = <T>(urlsAndOptions: UrlsAndOptions[]) => {
  const f = async (url: string, options: RequestInit) => fetcher(url, options);

  return Promise.all<T>(
    urlsAndOptions.map(({ url, options }) => f(url, options))
  );
};
