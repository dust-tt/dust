import type { RedisUsageTagsType } from "@app/lib/api/redis";
import { createRedisStreamClient } from "@app/lib/api/redis";
import { fromEvent } from "@app/lib/utils/events";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import tracer from "@app/logger/tracer";
import { EventEmitter } from "events";
import type { RedisClientType } from "redis";
import { commandOptions } from "redis";

type EventCallback = (event: EventPayload | "close") => void;

// Conservative value to prevent memory spikes during deployment reconnection bursts.
// Clients automatically paginate if more history is needed.
const HISTORY_FETCH_COUNT = 50;

const MAX_PUBLISH_ATTEMPTS = 5;

export type EventPayload = {
  id: string;
  message: {
    payload: string;
  };
};

/**
 * Redis Hybrid Manager that combines Streams and Pub/Sub
 * - Uses Streams for message history
 * - Uses Pub/Sub for real-time updates
 * - Publishes to both for guaranteed delivery
 */
class RedisHybridManager {
  private static instance: RedisHybridManager;
  private static paddingCounter = 0;
  private subscriptionClient: RedisClientType | null = null;
  private streamAndPublishClient: RedisClientType | null = null;
  private subscribers: Map<string, Set<EventCallback>> = new Map();
  private pubSubReconnectTimer: NodeJS.Timeout | null = null;
  private streamReconnectTimer: NodeJS.Timeout | null = null;

  private CHANNEL_PREFIX = "channel:";
  private STREAM_PREFIX = "stream:";

  // Track active subscriptions for monitoring.
  private activeSubscriptionCount = 0;
  // Track concurrent history fetches to identify overload.
  private concurrentHistoryFetches = 0;

  private constructor() {}

  public static getInstance(): RedisHybridManager {
    if (!RedisHybridManager.instance) {
      RedisHybridManager.instance = new RedisHybridManager();
    }
    return RedisHybridManager.instance;
  }

  private async getSubscriptionClient(): Promise<RedisClientType> {
    if (!this.subscriptionClient) {
      this.subscriptionClient = await createRedisStreamClient({
        origin: "conversation_events",
        options: {
          socket: {
            reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
          },
        },
      });

      this.subscriptionClient.on("error", (err) => {
        logger.error({ error: err }, "Redis subscription client error");
        this.scheduleSubscriptionReconnect();
      });

      this.subscriptionClient.on("connect", async () => {
        logger.debug("Redis subscription client connected");

        if (this.pubSubReconnectTimer) {
          clearTimeout(this.pubSubReconnectTimer);
          this.pubSubReconnectTimer = null;
        }

        await this.resubscribeToChannels();
      });
    }

    return this.subscriptionClient;
  }

  private async getStreamAndPublishClient(): Promise<RedisClientType> {
    if (!this.streamAndPublishClient) {
      this.streamAndPublishClient = await createRedisStreamClient({
        origin: "message_events",
        options: {
          socket: {
            reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
          },
          isolationPoolOptions: {
            min: 1,
            max: 100,
          },
        },
      });

      this.streamAndPublishClient.on("error", (err) => {
        logger.error({ error: err }, "Redis stream and publish client error");
        this.scheduleStreamAndPublishReconnect();
      });

      this.streamAndPublishClient.on("connect", () => {
        logger.debug("Redis stream and publish client connected");
        if (this.streamReconnectTimer) {
          clearTimeout(this.streamReconnectTimer);
          this.streamReconnectTimer = null;
        }
      });
    }

    return this.streamAndPublishClient;
  }

  /**
   * Schedule a reconnection attempt for the subscription client
   */
  private scheduleSubscriptionReconnect(): void {
    if (this.pubSubReconnectTimer) {
      return;
    }

    this.pubSubReconnectTimer = setTimeout(async () => {
      this.pubSubReconnectTimer = null;
      try {
        await this.getSubscriptionClient();
      } catch (error) {
        logger.error(
          { error },
          "Error reconnecting subscription client to Redis"
        );
        this.scheduleSubscriptionReconnect();
      }
    }, 5000);
  }

  /**
   * Schedule a reconnection attempt for the stream and publish client
   */
  private scheduleStreamAndPublishReconnect(): void {
    if (this.streamReconnectTimer) {
      return;
    }

    this.streamReconnectTimer = setTimeout(async () => {
      this.streamReconnectTimer = null;
      try {
        await this.getStreamAndPublishClient();
      } catch (error) {
        logger.error(
          { error },
          "Error reconnecting stream and publish client to Redis"
        );
        this.scheduleStreamAndPublishReconnect();
      }
    }, 5000);
  }

  private async resubscribeToChannels(): Promise<void> {
    if (!this.subscriptionClient) {
      return;
    }

    // Use the keys of the subscribers Map instead of activeSubscriptions
    for (const channel of this.subscribers.keys()) {
      try {
        await this.subscriptionClient.subscribe(channel, this.onMessage);
      } catch (error) {
        logger.error({ error, channel }, "Error resubscribing to channel");
      }
    }
  }

  /**
   * Publish an event to both a stream and a pub/sub channel
   */
  public async publish(
    channelName: string,
    data: string,
    origin: RedisUsageTagsType,
    ttl: number = 60 * 10 // 10 minutes
  ): Promise<string> {
    const streamAndPublishClient = await this.getStreamAndPublishClient();
    const streamName = this.getStreamName(channelName);
    const pubSubChannelName = this.getPubSubChannelName(channelName);

    let lastError: unknown | undefined = undefined;

    // Try to publish the event up to MAX_PUBLISH_ATTEMPTS times to avoid losing events in case of a temporary Redis error.
    for (let i = 0; i < MAX_PUBLISH_ATTEMPTS; ++i) {
      // Generate a unique event ID in redis expected format with a padding static counter to avoid collisions
      // Redis expected format is: <timestamp>-<number> and eventId should be unique AND incrementing.
      // The padding counter is used to ensure that the eventId is unique and incrementing when the timestamp is the same.
      // We recompute the eventId for each attempt to avoid race conditions with other clients publishing events.
      const startTime = Date.now();
      const eventId = `${startTime}-${RedisHybridManager.paddingCounter}`;

      // Increment the padding counter and wrap around to avoid overflow
      RedisHybridManager.paddingCounter =
        (RedisHybridManager.paddingCounter + 1) % 1000;

      const eventPayload: EventPayload = {
        id: eventId,
        message: { payload: data },
      };

      try {
        // Publish to stream for history, set expiration on stream and publish to pub/sub in a single pipeline to avoid 3 round trips to Redis (3 => 1).
        // Using Promise.all is the idiomatic way to do this in node-redis https://redis.io/docs/latest/develop/clients/nodejs/transpipe/#execute-a-pipeline
        await Promise.all([
          streamAndPublishClient.xAdd(streamName, eventId, {
            payload: data,
          }),
          streamAndPublishClient.expire(streamName, ttl),
          streamAndPublishClient.publish(
            pubSubChannelName,
            // Mimick the format of the event from the stream so that the subscriber can use the same logic
            JSON.stringify(eventPayload)
          ),
        ]);

        return eventId;
      } catch (error) {
        lastError = error;
        logger.warn(
          {
            error,
            pubSubChannelName,
            streamName,
            origin,
            attempt: i + 1,
            maxAttempts: MAX_PUBLISH_ATTEMPTS,
          },
          "Error publishing to Redis, retrying..."
        );
        // Sleep for ~10ms to avoid flooding the Redis stream with events.
        await new Promise((resolve) =>
          setTimeout(resolve, 5 + Math.floor(Math.random() * 5))
        );
      }
    }

    logger.error(
      {
        error: lastError,
        pubSubChannelName,
        streamName,
        origin,
      },
      "Error publishing to Redis, giving up after all attempts."
    );
    throw lastError;
  }

  /**
   * Subscribe to a channel for real-time updates
   * and fetch history from the corresponding stream
   */
  public async subscribe(
    channelName: string,
    callback: EventCallback,
    lastEventId: string | null = null,
    origin: string
  ): Promise<{
    history: EventPayload[];
    unsubscribe: () => void;
  }> {
    return tracer.trace(
      "redis.hybrid.subscribe",
      { resource: origin },
      async () => {
        const subscribeStartMs = Date.now();

        const clientsStartMs = Date.now();
        const subscriptionClient = await this.getSubscriptionClient();
        const streamClient = await this.getStreamAndPublishClient();
        const clientsDurationMs = Date.now() - clientsStartMs;
        statsDClient.distribution(
          "sse.subscribe.get_clients_duration_ms",
          clientsDurationMs
        );

        const streamName = this.getStreamName(channelName);
        const pubSubChannelName = this.getPubSubChannelName(channelName);

        // Make sure the subscribers map is initialized
        const channelSetupStartMs = Date.now();
        if (!this.subscribers.has(pubSubChannelName)) {
          this.subscribers.set(pubSubChannelName, new Set());
          // Subscribe to the channel if this is the first subscriber
          await subscriptionClient.subscribe(pubSubChannelName, this.onMessage);
        }
        const channelSetupDurationMs = Date.now() - channelSetupStartMs;
        statsDClient.distribution(
          "sse.subscribe.channel_setup_duration_ms",
          channelSetupDurationMs
        );

        const eventsDuringHistoryFetch: EventPayload[] = [];
        const eventsDuringHistoryFetchCallback: EventCallback = (
          event: EventPayload | "close"
        ) => {
          if (event !== "close") {
            eventsDuringHistoryFetch.push(event);
          }
        };

        // Add to subscribers map during history fetch to avoid race condition
        this.subscribers
          .get(pubSubChannelName)!
          .add(eventsDuringHistoryFetchCallback);

        const historyFetchStartMs = Date.now();
        const { events: history, hasMore: historyHasMore } =
          await this.getHistory(
            streamClient,
            streamName,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            lastEventId || "0-0"
          );
        const historyFetchDurationMs = Date.now() - historyFetchStartMs;
        statsDClient.distribution(
          "sse.subscribe.history_fetch_duration_ms",
          historyFetchDurationMs
        );

        // Remove the temporary callback from the subscribers map
        this.subscribers
          .get(pubSubChannelName)!
          .delete(eventsDuringHistoryFetchCallback);

        // Immediately add the real callback to the subscribers map
        this.subscribers.get(pubSubChannelName)!.add(callback);

        // Track active subscription count for monitoring.
        this.activeSubscriptionCount++;
        statsDClient.gauge(
          "sse.active_subscriptions",
          this.activeSubscriptionCount
        );
        // Track subscription rate (increment counter to get rate per second).
        statsDClient.increment("sse.subscription_established", 1);

        // Append the events during history fetch to the history, if any
        const dedupeStartMs = Date.now();
        if (eventsDuringHistoryFetch.length > 0) {
          // Use Set for O(1) deduplication instead of O(n) find
          const historyIds = new Set(history.map((h) => h.id));

          for (const event of eventsDuringHistoryFetch) {
            // deduplicate events
            if (!historyIds.has(event.id)) {
              history.push(event);
            }
          }
          // Sort the history just in case
          history.sort((a, b) => a.id.localeCompare(b.id));
        }
        const dedupeDurationMs = Date.now() - dedupeStartMs;
        statsDClient.distribution(
          "sse.subscribe.dedupe_duration_ms",
          dedupeDurationMs
        );

        if (historyHasMore) {
          // Force the client to re-subscribe with the latest event id it had in order to get more events from history.
          callback("close");
        }

        // Track total subscription establishment time.
        const subscribeDurationMs = Date.now() - subscribeStartMs;
        statsDClient.timing(
          "sse.subscription.total_duration_ms",
          subscribeDurationMs
        );

        return {
          history,
          unsubscribe: async () => {
            const subscribers = this.subscribers.get(pubSubChannelName);
            if (subscribers) {
              callback("close");
              subscribers.delete(callback);

              // Track active subscription count for monitoring.
              this.activeSubscriptionCount--;
              statsDClient.gauge(
                "sse.active_subscriptions",
                this.activeSubscriptionCount
              );

              if (subscribers.size === 0) {
                // No more subscribers for this channel
                this.subscribers.delete(pubSubChannelName);
                // Unsubscribe from the channel
                if (this.subscriptionClient) {
                  try {
                    await this.subscriptionClient.unsubscribe(
                      pubSubChannelName
                    );
                  } catch (error) {
                    logger.error(
                      { error, channel: pubSubChannelName },
                      "Error unsubscribing from channel"
                    );
                  }
                }
                logger.debug(
                  { pubSubChannelName: pubSubChannelName, origin },
                  "Unsubscribed from Redis channel"
                );
              }
            }
          },
        };
      }
    ); // End tracer.trace("redis.hybrid.subscribe")
  }

  public async removeEvent(
    predicate: (event: EventPayload) => boolean,
    channel: string
  ): Promise<void> {
    const streamClient = await this.getStreamAndPublishClient();
    const streamName = this.getStreamName(channel);
    let historyHasMore = true;
    let lastEventId: string | undefined = undefined;
    while (historyHasMore) {
      const { events: history, hasMore } = await this.getHistory(
        streamClient,
        streamName,
        lastEventId
      );

      for (const event of history) {
        if (predicate(event)) {
          await streamClient.xDel(streamName, event.id);
          logger.debug({ channel }, "Deleted event from Redis stream");
        }
      }
      historyHasMore = hasMore;
      lastEventId = history.at(-1)?.id ?? lastEventId;
    }
  }

  private async getHistory(
    streamClient: RedisClientType,
    streamName: string,
    lastEventId: string = "0-0"
  ): Promise<{ events: EventPayload[]; hasMore: boolean }> {
    return tracer.trace(
      "redis.xread.history",
      { resource: streamName },
      async () => {
        const historyStartMs = Date.now();

        this.concurrentHistoryFetches++;
        statsDClient.gauge(
          "sse.history.concurrent_fetches",
          this.concurrentHistoryFetches
        );
        statsDClient.increment("sse.history.fetch_started");

        try {
          const xReadStartMs = Date.now();
          const result = await tracer
            .trace("redis.xread.command", async () => {
              return streamClient.xRead(
                commandOptions({ isolated: true }),
                { key: streamName, id: lastEventId },
                { COUNT: HISTORY_FETCH_COUNT }
              );
            })
            .then((events) => {
              const xReadDurationMs = Date.now() - xReadStartMs;
              statsDClient.distribution(
                "sse.history.xread_duration_ms",
                xReadDurationMs
              );

              const parseStartMs = Date.now();
              if (events) {
                const finalEvents = events.flatMap((event) =>
                  event.messages.map((message) => ({
                    id: message.id,
                    message: { payload: message.message["payload"] },
                  }))
                );

                const eventCount = finalEvents.length;
                const hasMore = eventCount >= HISTORY_FETCH_COUNT;

                const parseDurationMs = Date.now() - parseStartMs;
                statsDClient.distribution(
                  "sse.history.parse_duration_ms",
                  parseDurationMs
                );

                // Track all event replays, including from-beginning fetches during deployment.
                statsDClient.histogram(
                  "sse.history.events_replayed",
                  eventCount
                );

                return {
                  events: finalEvents,
                  hasMore,
                };
              }
              return { events: [], hasMore: false };
            });

          const totalHistoryDurationMs = Date.now() - historyStartMs;
          statsDClient.distribution(
            "sse.history.total_duration_ms",
            totalHistoryDurationMs
          );

          return result;
        } catch (error) {
          logger.error(
            {
              error,
              streamName,
              lastEventId,
            },
            "Error fetching history from stream"
          );
          return await Promise.resolve({ events: [], hasMore: false });
        } finally {
          this.concurrentHistoryFetches--;
          statsDClient.gauge(
            "sse.history.concurrent_fetches",
            this.concurrentHistoryFetches
          );
        }
      }
    ); // End tracer.trace("redis.xread.history")
  }

  private onMessage = (message: string, channel: string) => {
    const subscribers = this.subscribers.get(channel);
    if (subscribers && subscribers.size > 0) {
      try {
        const event: EventPayload = JSON.parse(message);

        subscribers.forEach((callback) => {
          try {
            callback(event);
          } catch (error) {
            logger.error({ error, channel }, "Error in subscriber callback");
          }
        });
      } catch (error) {
        logger.error({ error, channel }, "Error parsing message");
      }
    }
  };

  /**
   * Get the pub/sub channel name for a given channel name
   */
  private getPubSubChannelName(channelName: string): string {
    return `${this.CHANNEL_PREFIX}${channelName}`;
  }

  /**
   * Map a channel name to a stream name
   * By default, they're the same, but you can override this
   */
  private getStreamName(channelName: string): string {
    return `${this.STREAM_PREFIX}${channelName}`;
  }

  /**
   * Subscribe to a channel and return an async iterator for events using fromEvent helper
   */
  public async subscribeAsAsyncIterator<T>({
    channelName,
    includeHistory = true,
    lastEventId,
    origin,
  }: {
    channelName: string;
    includeHistory: boolean;
    lastEventId: string | null;
    origin: RedisUsageTagsType;
  }): Promise<{
    iterator: AsyncGenerator<T, void, unknown>;
    unsubscribe: () => void;
  }> {
    // Create a temporary EventEmitter to bridge Redis to fromEvent.
    const eventEmitter = new EventEmitter();

    const { history, unsubscribe } = await this.subscribe(
      channelName,
      (event) => {
        if (event === "close") {
          eventEmitter.emit("end");
          return;
        }

        try {
          const parsedEvent = JSON.parse(event.message.payload) as T;
          eventEmitter.emit("data", parsedEvent);
        } catch (error) {
          logger.error(
            { error, channel: channelName },
            "Error parsing Redis event"
          );
          eventEmitter.emit("error", error);
        }
      },
      lastEventId,
      origin
    );

    // Create the async iterator using fromEvent.
    const iterator = fromEvent<T>(eventEmitter, "data");

    // Emit history events first (on next tick to ensure iterator is ready).
    if (includeHistory) {
      process.nextTick(() => {
        for (const historyEvent of history) {
          try {
            const parsedEvent = JSON.parse(historyEvent.message.payload) as T;
            eventEmitter.emit("data", parsedEvent);
          } catch (error) {
            logger.error(
              { error, channel: channelName },
              "Error parsing Redis history event"
            );
          }
        }
      });
    }

    return {
      iterator,
      unsubscribe: () => {
        eventEmitter.emit("end");
        unsubscribe();
      },
    };
  }

  /**
   * Ping Redis to check connectivity.
   * Used by startup probe to verify Redis is accessible before accepting traffic.
   */
  public async ping(): Promise<void> {
    const streamClient = await this.getStreamAndPublishClient();
    const subscriptionClient = await this.getSubscriptionClient();

    await streamClient.ping();
    await subscriptionClient.ping();
  }
}

export const getRedisHybridManager = () => {
  return RedisHybridManager.getInstance();
};
