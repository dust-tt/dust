import { GotScrapingHttpClient } from "@crawlee/core";
import type {
  HttpRequest,
  HttpResponse,
  RedirectHandler,
  ResponseTypes,
  StreamingHttpResponse,
} from "crawlee";

import { verifyRedirect } from "@connectors/connectors/webcrawler/lib/utils";

export class DustHttpClient extends GotScrapingHttpClient {
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

    return super.sendRequest({
      ...request,
      url: res.value,
      followRedirect: false,
    });
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

    return super.stream(
      {
        ...request,
        url: res.value,
        followRedirect: false,
      },
      handleRedirect
    );
  }
}
