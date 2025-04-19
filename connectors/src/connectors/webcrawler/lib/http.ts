import { GotScrapingHttpClient } from "@crawlee/core";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type {
  HttpRequest,
  HttpResponse,
  RedirectHandler,
  ResponseTypes,
  StreamingHttpResponse,
} from "crawlee";
import { NonRetryableError } from "crawlee";

import {
  getIpAddressForUrl,
  isPrivateIp,
} from "@connectors/connectors/webcrawler/lib/utils";

const MAX_REDIRECTS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type WebCrawlerErrorName =
  | "PRIVATE_IP"
  | "NOT_IP_V4"
  | "MAX_REDIRECTS"
  | "REDIRECT_MISSING_LOCATION"
  | "CIRCULAR_REDIRECT"
  | "PROTOCOL_DOWNGRADE";

export class WebCrawlerError extends NonRetryableError {
  constructor(
    message: string,
    readonly type: WebCrawlerErrorName,
    readonly originalError?: Error
  ) {
    super(message);
  }
}

export class DustHttpClient extends GotScrapingHttpClient {
  /**
   * @inheritDoc
   */
  async sendRequest<TResponseType extends keyof ResponseTypes>(
    request: HttpRequest<TResponseType>
  ): Promise<HttpResponse<TResponseType>> {
    const res = await this.verifyRedirect(request.url);

    if (res.isErr()) {
      throw res.error;
    }

    return super.sendRequest({
      ...request,
      url: res.value,
    });
  }

  /**
   * @inheritDoc
   */
  async stream(
    request: HttpRequest,
    handleRedirect?: RedirectHandler
  ): Promise<StreamingHttpResponse> {
    const res = await this.verifyRedirect(request.url);

    if (res.isErr()) {
      throw res.error;
    }

    return super.stream(
      {
        ...request,
        url: res.value,
      },
      handleRedirect
    );
  }

  /**
   * Loop if needed on redirect location,
   * throw a Result Err that would warrant
   * a NonRetryableError. Otherwise return the last
   * url that is not a redirect
   */
  async verifyRedirect(
    initUrl: string | URL
  ): Promise<Result<string | URL, WebCrawlerError>> {
    let url = initUrl;
    let foundEndOfRedirect = false;
    let redirectCount = 0;
    const visitedUrls = new Set<string | URL>();

    do {
      // Fail fast if it get into a loop
      if (visitedUrls.has(url)) {
        return new Err(
          new WebCrawlerError(
            "Invalid redirect: Circular redirect detected",
            "CIRCULAR_REDIRECT"
          )
        );
      }
      visitedUrls.add(url);

      // Prevent infinite loops
      if (redirectCount++ >= MAX_REDIRECTS) {
        return new Err(
          new WebCrawlerError(
            "Maximum redirect count exceeded",
            "MAX_REDIRECTS"
          )
        );
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(url, {
          method: "HEAD",
          redirect: "manual",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (REDIRECT_STATUSES.has(response.status)) {
          const redirectUrl = response.headers
            .get("location")
            ?.trim()
            .replace(/[\r\n\t]/g, ""); // Sanitize location, avoid header injection
          if (!redirectUrl) {
            // Server returned a redirect status without Location header
            return new Err(
              new WebCrawlerError(
                `Invalid redirect: Missing Location header for status ${response.status}`,
                "REDIRECT_MISSING_LOCATION"
              )
            );
          }

          let resolvedUrl: URL;
          // relative redirect
          if (redirectUrl.startsWith("/")) {
            resolvedUrl = new URL(redirectUrl, url);
          } else {
            resolvedUrl = new URL(redirectUrl);
          }

          if (
            new URL(initUrl).protocol === "https:" &&
            resolvedUrl.protocol !== "https:"
          ) {
            return new Err(
              new WebCrawlerError(
                "Invalid redirect: going from https to http",
                "PROTOCOL_DOWNGRADE"
              )
            );
          }

          const checkIpRes = await this.checkIp(resolvedUrl);
          if (checkIpRes.isErr()) {
            return checkIpRes;
          }

          url = redirectUrl;
        } else {
          foundEndOfRedirect = true;
        }
      } catch (err) {
        // try catch only to make sure we clear the timeout in case fetch failed
        clearTimeout(timeoutId);
        throw err;
      }
    } while (!foundEndOfRedirect);

    return new Ok(url);
  }

  /**
   * Check if IP behind url is ipv4 and is not a private ip
   */
  async checkIp(url: URL): Promise<Result<void, WebCrawlerError>> {
    const { address, family } = await getIpAddressForUrl(url.toString());
    if (family !== 4) {
      return new Err(
        new WebCrawlerError(`IP address is not IPv4: ${address}`, "NOT_IP_V4")
      );
    }

    if (url.hostname === "localhost") {
      return new Err(
        new WebCrawlerError("No localhost authorized", "PRIVATE_IP")
      );
    }

    if (isPrivateIp(address)) {
      return new Err(
        new WebCrawlerError("Private IP adress detected", "PRIVATE_IP")
      );
    }

    return new Ok(undefined);
  }
}
