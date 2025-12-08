import { error, log } from "firebase-functions/logger";
import type { IncomingHttpHeaders } from "http";

import { CONFIG } from "./config.js";
import type { Secrets } from "./secrets.js";
import type { Region } from "./webhook-router-config.js";

type WebhookTarget = { region: Region; url: string; secret: string };

export class WebhookForwarder {
  constructor(private secrets: Secrets) {}

  async forwardToRegions({
    body,
    endpoint,
    method,
    headers,
    regions,
    rootUrlToken = "webhooks",
    providerWorkspaceId,
  }: {
    body: unknown;
    endpoint: string;
    method: string;
    headers: IncomingHttpHeaders;
    regions: readonly Region[];
    rootUrlToken?: string;
    providerWorkspaceId?: string;
  }): Promise<PromiseSettledResult<Response>[]> {
    const targets: WebhookTarget[] = [
      {
        region: "us-central1",
        url: CONFIG.US_CONNECTOR_URL,
        secret: this.secrets.usSecret,
      },
      {
        region: "europe-west1",
        url: CONFIG.EU_CONNECTOR_URL,
        secret: this.secrets.euSecret,
      },
    ];

    const requests = targets
      .filter(({ region }) => regions.includes(region))
      .map((target) =>
        this.forwardToTarget({
          target,
          endpoint,
          method,
          body,
          headers,
          rootUrlToken,
          providerWorkspaceId,
        })
      );

    return Promise.allSettled(requests);
  }

  private async forwardToTarget({
    body,
    endpoint,
    method,
    target,
    headers,
    rootUrlToken,
    providerWorkspaceId,
  }: {
    body: unknown;
    endpoint: string;
    method: string;
    target: WebhookTarget;
    headers: IncomingHttpHeaders;
    rootUrlToken: string;
    providerWorkspaceId?: string;
  }): Promise<Response> {
    try {
      const response = await this.createRequest({
        baseUrl: target.url,
        body,
        endpoint,
        method,
        secret: target.secret,
        headers,
        rootUrlToken,
      });

      log("Webhook forwarding succeeded", {
        component: "forwarder",
        region: target.region,
        endpoint,
        providerWorkspaceId,
        status: response.status,
      });

      return response;
    } catch (e) {
      error("Webhook forwarding failed", {
        component: "forwarder",
        region: target.region,
        endpoint,
        error: e instanceof Error ? e.message : String(e),
      });

      throw e;
    }
  }

  private createRequest({
    baseUrl,
    body,
    endpoint,
    method,
    secret,
    headers,
    rootUrlToken,
  }: {
    baseUrl: string;
    body: unknown;
    endpoint: string;
    method: string;
    secret: string;
    headers: IncomingHttpHeaders;
    rootUrlToken: string;
  }): Promise<Response> {
    const url = `${baseUrl}/${rootUrlToken}/${secret}/${endpoint}`;

    // Forward with original content-type and appropriate body format.
    return fetch(url, {
      method,
      headers: {
        "Content-Type": headers["content-type"] || "application/json",
        "x-dust-clientid": "webhook-router",
        authorization: headers["authorization"] || "",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT_MS),
    });
  }
}
