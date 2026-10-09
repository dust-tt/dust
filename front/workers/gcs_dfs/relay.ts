import {
  objectOrderingKey,
  parseNotification,
} from "@app/workers/gcs_dfs/protocol";
import type { Message, RelayConfig } from "@app/workers/gcs_dfs/protocol";
import { ignoreObservation } from "@app/workers/gcs_dfs/telemetry";
import type { Observer } from "@app/workers/gcs_dfs/telemetry";
import {
  processDeliveries,
  runDeliveryLoop,
} from "@app/workers/gcs_dfs/worker";
import type { Subscription } from "@app/workers/gcs_dfs/worker";

export interface Publisher {
  publish(
    topic: string,
    message: Message["message"],
    orderingKey: string
  ): Promise<void>;
}

export function processRelayBatch(
  messages: Message[],
  config: RelayConfig,
  subscription: Subscription,
  publisher: Publisher,
  observe: Observer = ignoreObservation
) {
  const key = (message: Message) => {
    const { binding, metadata } = parseNotification(message, config.bindings);
    return objectOrderingKey(binding.workspaceId, metadata.name);
  };
  return processDeliveries(
    messages,
    config,
    subscription,
    key,
    async (message) => {
      await publisher.publish(config.topic, message.message, key(message));
      return "published";
    },
    observe
  );
}

export function runRelay(
  config: RelayConfig,
  subscription: Subscription,
  publisher: Publisher,
  stopping: () => boolean,
  observe: Observer = ignoreObservation
) {
  return runDeliveryLoop(
    subscription,
    (messages) =>
      processRelayBatch(messages, config, subscription, publisher, observe),
    stopping
  );
}
