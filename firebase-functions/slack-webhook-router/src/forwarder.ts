import {IncomingHttpHeaders} from "http";
import {CONFIG} from "./config.js";
import type {Secrets} from "./secrets.js";

export class WebhookForwarder {
    constructor(private secrets: Secrets) {
    }

    async forwardToRegions({
                               body,
                               endpoint,
                               method,
                               headers,
                           }: {
        body: unknown;
        endpoint: string;
        method: string;
        headers: IncomingHttpHeaders;
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
            this.forwardToTarget({target, endpoint, method, body, headers})
        );

        await Promise.allSettled(requests);
    }

    private async forwardToTarget({
                                      body,
                                      endpoint,
                                      method,
                                      target,
                                      headers,
                                  }: {
        body: unknown;
        endpoint: string;
        method: string;
        target: { region: string; url: string; secret: string };
        headers: IncomingHttpHeaders;
    }): Promise<void> {
        try {
            const response = await this.createRequest({
                baseUrl: target.url,
                body,
                endpoint,
                method,
                secret: target.secret,
                headers,
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
                              headers,
                          }: {
        baseUrl: string;
        body: unknown;
        endpoint: string;
        method: string;
        secret: string;
        headers: IncomingHttpHeaders;
    }): Promise<Response> {
        const url = `${baseUrl}/webhooks/${secret}/${endpoint}`;

        // Forward with original content-type and appropriate body format.
        return fetch(url, {
            method,
            headers: {
                "Content-Type": headers["content-type"] || "application/json",
                "x-dust-clientid": "slack-webhook-router"
            },
            body: typeof body === "string" ? body : JSON.stringify(body),
            signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT_MS),
        });
    }
}
