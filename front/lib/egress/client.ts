import { getBaseUrl, getDefaultInit } from "@app/lib/api/config";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { EventSourcePolyfillInit } from "event-source-polyfill";
import { EventSourcePolyfill } from "event-source-polyfill";

/**
 * Resolve the default `RequestInit` for the current context, awaiting the resolver since it may
 * refresh an expired token.
 */
async function resolveDefaults(
  baseUrl: string
): Promise<RequestInit | undefined> {
  const defaults = await getDefaultInit();
  if (defaults) {
    return defaults;
  }

  // Only the SPA context has a base URL, where the API is cross-origin: cookies must be sent
  // explicitly. In Next.js the request is same-origin and needs no override.
  return baseUrl ? { credentials: "include" } : undefined;
}

/**
 * Rewrite relative URLs onto the resolved base URL. Only done when a base URL resolver is active
 * (SPA context); in Next.js, relative URLs work fine and should not be rewritten.
 */
function resolveUrl<T extends RequestInfo | URL>(
  input: T,
  baseUrl: string
): T | string {
  if (baseUrl && isString(input) && input.startsWith("/")) {
    return `${baseUrl}${input}`;
  }

  return input;
}

/**
 * @cc [owner:Nils-Fedrigo,label:security] single-request-resolution-point
 * `resolveRequest` MUST be the only place resolving a client request's target and auth context. It
 * MUST rewrite the URL through `resolveUrl`, merge the caller's `init` over the context defaults
 * with the caller's headers winning per header name, and expose that same auth context in all
 * three shapes it returns, so no transport can observe a different URL, header set or credentials
 * mode than another. A transport MAY drop a header the body it sends is incompatible with (see
 * `Content-Type` in `clientUpload`), but MUST NOT add or rewrite one.
 */
async function resolveRequest<T extends RequestInfo | URL>(
  input: T,
  init?: RequestInit
): Promise<{
  /** Target URL, rewritten when relative. */
  url: T | string;
  /** Merged init, for `fetch`. */
  init: RequestInit | undefined;
  /** Merged headers, for transports that apply headers themselves. */
  headers: Headers;
  /**
   * `credentials` mapped onto the `withCredentials` flag of the `XMLHttpRequest`-based transports,
   * or `undefined` when no credentials mode applies and the transport default should stand.
   */
  withCredentials: boolean | undefined;
}> {
  const baseUrl = getBaseUrl();
  const defaults = await resolveDefaults(baseUrl);

  // `Headers` normalizes every `HeadersInit` shape, so callers may pass any of them.
  const headers = new Headers(defaults?.headers);
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));

  const credentials = init?.credentials ?? defaults?.credentials;

  return {
    url: resolveUrl(input, baseUrl),
    init: defaults ? { ...defaults, ...init, credentials, headers } : init,
    headers,
    withCredentials:
      credentials === undefined ? undefined : credentials === "include",
  };
}

// Client-side fetch helper. This is a simple alias for the global fetch, used to satisfy
// the linter rule that discourages direct use of `fetch`. On the client, we cannot route
// through a proxy, so this is just a pass-through.
export async function clientFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const resolved = await resolveRequest(input, init);

  // eslint-disable-next-line no-restricted-globals
  return fetch(resolved.url, resolved.init);
}

// Client-side EventSource helper. Shares `resolveRequest` with `clientFetch` so that SSE
// connections pick up the same auth context (Bearer tokens in the extension, cookies in the
// web app).
export async function clientEventSource(
  input: string,
  init?: EventSourcePolyfillInit
): Promise<EventSourcePolyfill> {
  const { url, headers, withCredentials } = await resolveRequest(input, {
    headers: init?.headers,
  });

  return new EventSourcePolyfill(url, {
    ...init,
    headers: Object.fromEntries(headers),
    ...(withCredentials !== undefined && { withCredentials }),
  });
}

/**
 * @cc [owner:Nils-Fedrigo,label:error-handling] upload-rejects-like-fetch
 * `clientUpload` MUST mirror `fetch` failure semantics: it rejects with an `Error` on transport
 * failure (network error, timeout, abort) and resolves with a `Response` carrying whatever HTTP
 * status the server returned, error statuses included. A response the platform cannot represent as
 * a `Response` (a status outside `[200, 599]`, a `statusText` it refuses) MUST reject rather than
 * resolve. This is an explicit exception to `no-catching-own-errors`, limited to those transport
 * failures: callers MUST catch the rejection, as they already do around `clientFetch`.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:error-handling] upload-promise-always-settles
 * `clientUpload`'s promise MUST settle for every `XMLHttpRequest` outcome. Handlers run outside the
 * promise executor, so a throw escapes instead of rejecting: those that settle (`onload`,
 * `onerror`, `ontimeout`, `onabort`) MUST be total, or the upload state is stranded for good.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:coding] upload-progress-is-bytes-sent
 * `onProgress` MUST be called with the percentage of request bytes already sent, as an integer in
 * `[0, 100]` rounded down, and MUST NOT be called with `100` before the whole body has been sent.
 * It MUST NOT be called when the total size is unknown. Callers rely on `100` meaning "body sent,
 * waiting for the server to process it", which happens strictly before the returned promise
 * resolves.
 */
export async function clientUpload(
  input: string,
  body: FormData,
  { onProgress }: { onProgress?: (percentSent: number) => void } = {}
): Promise<Response> {
  const { url, headers, withCredentials } = await resolveRequest(input);

  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    // The browser derives `multipart/form-data` and its boundary from the `FormData` body, so any
    // `Content-Type` coming from the context defaults has to go: keeping it would replace that
    // header and leave the server unable to parse the body.
    headers.delete("content-type");
    headers.forEach((value, name) => {
      xhr.setRequestHeader(name, value);
    });
    // `XMLHttpRequest` defaults to not sending cross-origin credentials.
    xhr.withCredentials = withCredentials ?? false;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.floor((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      // `Response` throws on a status outside [200, 599] and on a `statusText` it refuses, both of
      // which are server-controlled. Thrown here the error would escape the promise and leave it
      // pending, so the whole handler is guarded.
      try {
        // `Response` rejects statuses below 200 and a body on the no-content statuses.
        if (xhr.status < 200) {
          reject(new Error(`Upload failed with status ${xhr.status}.`));
          return;
        }

        // The synthesized `Response` carries no headers: no caller needs them today. Copy them
        // over from `xhr.getAllResponseHeaders()` if one ever does, since until then
        // `response.headers.get(...)` silently returns `null` rather than the server's value.
        const hasBody = ![204, 205, 304].includes(xhr.status);
        resolve(
          new Response(hasBody ? xhr.responseText : null, {
            status: xhr.status,
            statusText: xhr.statusText,
          })
        );
      } catch (err) {
        reject(
          new Error(
            `Upload returned a malformed response (status ${xhr.status}): ` +
              normalizeError(err).message
          )
        );
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.ontimeout = () => reject(new Error("Timed out while uploading."));
    xhr.onabort = () => reject(new Error("Upload was aborted."));

    xhr.send(body);
  });
}
