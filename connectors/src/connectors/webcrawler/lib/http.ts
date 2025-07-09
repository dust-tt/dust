import { GotScrapingHttpClient } from "@crawlee/core";
import type {
  HttpRequest,
  HttpResponse,
  RedirectHandler,
  ResponseTypes,
  StreamingHttpResponse,
} from "crawlee";

import { verifyRedirect } from "@connectors/connectors/webcrawler/lib/utils";
import { apiConfig } from "@connectors/lib/api/config";

export class DustHttpClient extends GotScrapingHttpClient {
  private proxyUrl: string | undefined;

  constructor() {
    super();

    const proxyHost = apiConfig.getUntrustedEgressProxyHost();
    const proxyPort = apiConfig.getUntrustedEgressProxyPort();

    if (proxyHost && proxyPort) {
      this.proxyUrl = `http://${proxyHost}:${proxyPort}`;
    }
  }
  /**
   * @inheritDoc
   */
  async sendRequest<TResponseType extends keyof ResponseTypes>(
    request: HttpRequest<TResponseType>
  ): Promise<HttpResponse<TResponseType>> {
    const res = await verifyRedirect(request.url);

    if (res.isErr()) {
      throw res.error;
    }

    const requestWithProxy = {
      ...request,
      url: res.value,
      followRedirect: false,
      ...(this.proxyUrl && { proxyUrl: this.proxyUrl }),
    };

    return super.sendRequest(requestWithProxy);
  }

  /**
   * @inheritDoc
   */
  async stream(
    request: HttpRequest,
    handleRedirect?: RedirectHandler
  ): Promise<StreamingHttpResponse> {
    const res = await verifyRedirect(request.url);

    if (res.isErr()) {
      throw res.error;
    }

    const requestWithProxy = {
      ...request,
      url: res.value,
      followRedirect: false,
      ...(this.proxyUrl && { proxyUrl: this.proxyUrl }),
    };

    return super.stream(requestWithProxy, handleRedirect);
  }
}
