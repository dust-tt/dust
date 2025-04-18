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
  | "REDIRECT_MISSING_LOCATION";

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

    do {
      // Prevent infinite loops
      if (redirectCount++ >= MAX_REDIRECTS) {
        return new Err(
          new WebCrawlerError(
            "Maximum redirect count exceeded",
            "MAX_REDIRECTS"
          )
        );
      }

      const response = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const redirectUrl = response.headers.get("location");
        if (!redirectUrl) {
          // Server returned a redirect status without Location header
          return new Err(
            new WebCrawlerError(
              `Invalid redirect: Missing Location header for status ${response.status}`,
              "REDIRECT_MISSING_LOCATION"
            )
          );
        }

        const checkIpRes = await this.checkIp(redirectUrl);
        if (checkIpRes.isErr()) {
          return checkIpRes;
        }

        url = redirectUrl;
      } else {
        foundEndOfRedirect = true;
      }
    } while (!foundEndOfRedirect);

    return new Ok(url);
  }

  /**
   * Check if IP behind url is ipv4 and is not a private ip
   */
  async checkIp(url: string): Promise<Result<void, WebCrawlerError>> {
    const { address, family } = await getIpAddressForUrl(url);
    if (family !== 4) {
      return new Err(
        new WebCrawlerError("IP address is not IPv4", "NOT_IP_V4")
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
