import type { Client } from "./client";
import {
  type OpenAIClientConfig,
  OpenAIResponsesClient,
} from "./providers/openai/client";

export { Client } from "./client";

export class ClientRouter {
  static get(providerId: "openai", config: OpenAIClientConfig): Client {
    switch (providerId) {
      case "openai":
        return new OpenAIResponsesClient(config);
      default:
        throw new Error(`Unknown provider: ${providerId}`);
    }
  }

  private constructor() {}
}
