import { trustedFetch } from "@app/lib/egress/server";

interface AIGuardMessage {
  role: string;
  content: string;
}

export interface AIGuardConfig {
  apiKey: string;
  appKey: string;
  endpoint: string;
}

export async function evaluateWithAIGuard(
  messages: AIGuardMessage[],
  config: AIGuardConfig
): Promise<unknown> {
  const response = await trustedFetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "DD-API-KEY": config.apiKey,
      "DD-APPLICATION-KEY": config.appKey,
    },
    body: JSON.stringify({
      data: {
        attributes: {
          messages,
          meta: { service: "dust-front" },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `AI Guard service returned ${response.status}: ${body.slice(0, 200)}`
    );
  }

  const body = await response.json();
  return body.data.attributes;
}
