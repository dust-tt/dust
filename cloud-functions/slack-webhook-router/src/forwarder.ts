import { CONFIG } from "./config.js";
import type { Secrets } from "./secrets.js";

export class WebhookForwarder {
  constructor(private secrets: Secrets) {}

  async forwardToRegions({
    body,
    endpoint,
    method,
  }: {
    body: unknown;
    endpoint: string;
    method: string;
  }): Promise<void> {
    const targets = [
      {
        region: "US",
        url: CONFIG.US_CONNECTOR_URL,
        secret: this.secrets.usSecret,
      },
      {
        region: "EU",
        url: CONFIG.EU_CONNECTOR_URL,
        secret: this.secrets.euSecret,
      },
    ];

    const requests = targets.map((target) =>
      this.forwardToTarget({ target, endpoint, method, body })
    );

    await Promise.allSettled(requests);
  }

  private async forwardToTarget({
    body,
    endpoint,
    method,
    target,
  }: {
    body: unknown;
    endpoint: string;
    method: string;
    target: { region: string; url: string; secret: string };
  }): Promise<void> {
    try {
      const response = await this.createRequest({
        baseUrl: target.url,
        body,
        endpoint,
        method,
        secret: target.secret,
      });

      console.log("Webhook forwarding succeeded", {
        component: "forwarder",
        region: target.region,
        endpoint,
        status: response.status,
      });
    } catch (error) {
      console.error("Webhook forwarding failed", {
        component: "forwarder",
        region: target.region,
        endpoint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private createRequest({
    baseUrl,
    body,
    endpoint,
    method,
    secret,
  }: {
    baseUrl: string;
    body: unknown;
    endpoint: string;
    method: string;
    secret: string;
  }): Promise<Response> {
    const url = `${baseUrl}/webhooks/${secret}/${endpoint}`;

    return fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT_MS),
    });
  }
}
