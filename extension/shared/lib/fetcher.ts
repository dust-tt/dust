import { clientFetch } from "@app/lib/egress/client";
import type { FetcherFn, FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import logger from "@app/logger/logger";

export class APIError extends Error {
  type: string;

  constructor(type: string, message: string) {
    super(message);
    this.type = type;
  }
}

export const addClientVersionHeaders = (
  headers: HeadersInit = {}
): HeadersInit => ({
  ...headers,
  "X-Commit-Hash": `${process.env.COMMIT_HASH}`,
  "X-Build-Date": `${process.env.BUILD_DATE}`,
  "X-Dust-Extension-Version": `${process.env.DUST_EXTENSION_VERSION}`,
});

export const resHandler = async (res: Response) => {
  if (res.status < 300) {
    return res.json();
  }

  let errorType = "unknown";
  let errorMessage = "Unknown error";

  try {
    const resJson = await res.json();
    const error = resJson.error;
    if (error?.type) {
      errorType = error.type;
    }
    errorMessage = error?.message ?? JSON.stringify(error);
  } catch (e) {
    logger.error({ err: e }, "Error parsing response.");
    errorMessage = await res.text();
  }

  logger.error(
    { status: res.status, errorMessage },
    "Error returned by the front API."
  );
  throw new APIError(errorType, errorMessage);
};

// Credentials and Authorization headers are handled by the defaultInitResolver
// (set in useAuth), so fetchers are plain clientFetch wrappers.
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
      ...((init?.headers as Record<string, string>) ?? {}),
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(body),
  });
  return resHandler(res);
};
