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

export type WebCrawlerErrorName = "PRIVATE_IP" | "NOT_IP_V4";

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

    do {
      const response = await fetch(url, {
        method: "HEAD",
        redirect: "manual",
      });

      if (response.status >= 300 && response.status < 400) {
        const redirectUrl = response.headers.get("location");
        if (redirectUrl != null) {
          const checkIpRes = await this.checkIp(redirectUrl);
          if (checkIpRes.isErr()) {
            return checkIpRes;
          }

          url = redirectUrl;
          continue;
        }
      }

      foundEndOfRedirect = true;
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
