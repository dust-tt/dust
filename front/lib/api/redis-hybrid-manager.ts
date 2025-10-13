import { EventEmitter } from "events";
import type { RedisClientType } from "redis";
import { createClient } from "redis";

import type { RedisUsageTagsType } from "@app/lib/api/redis";
import { fromEvent } from "@app/lib/utils/events";
import logger from "@app/logger/logger";

type EventCallback = (event: EventPayload | "close") => void;

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
  private subscriptionClient: RedisClientType | null = null;
  private streamAndPublishClient: RedisClientType | null = null;
  private subscribers: Map<string, Set<EventCallback>> = new Map();
  private pubSubReconnectTimer: NodeJS.Timeout | null = null;
  private streamReconnectTimer: NodeJS.Timeout | null = null;

  private CHANNEL_PREFIX = "channel:";
  private STREAM_PREFIX = "stream:";

  private constructor() {}

  public static getInstance(): RedisHybridManager {
    if (!RedisHybridManager.instance) {
      RedisHybridManager.instance = new RedisHybridManager();
    }
    return RedisHybridManager.instance;
  }

  /**
   * Get or initialize the Redis client
   */
  private async getSubscriptionClient(): Promise<RedisClientType> {
    if (!this.subscriptionClient) {
      const { REDIS_URI } = process.env;
      if (!REDIS_URI) {
        throw new Error("REDIS_URI is not defined");
      }

      this.subscriptionClient = createClient({
        url: REDIS_URI,
        socket: {
          reconnectStrategy: (retries) => {
            return Math.min(retries * 100, 3000); // Exponential backoff with max 3s
          },
        },
      });

      // Set up error handler
      this.subscriptionClient.on("error", (err) => {
        logger.error({ error: err }, "Redis subscription client error");
        this.scheduleSubscriptionReconnect();
      });

      // Set up reconnect handler
      this.subscriptionClient.on("connect", async () => {
        logger.debug("Redis subscription client connected");

        if (this.pubSubReconnectTimer) {
          clearTimeout(this.pubSubReconnectTimer);
          this.pubSubReconnectTimer = null;
        }

        // Resubscribe to all active channels
        await this.resubscribeToChannels();
      });

      await this.subscriptionClient.connect();
    }

    return this.subscriptionClient;
  }

  private async getStreamAndPublishClient(): Promise<RedisClientType> {
    if (!this.streamAndPublishClient) {
      const { REDIS_URI } = process.env;
      if (!REDIS_URI) {
        throw new Error("REDIS_URI is not defined");
      }

      this.streamAndPublishClient = createClient({
        url: REDIS_URI,
        socket: {
          reconnectStrategy: (retries) => {
            return Math.min(retries * 100, 3000); // Exponential backoff with max 3s
          },
        },
      });

      // Set up error handler
      this.streamAndPublishClient.on("error", (err) => {
        logger.error({ error: err }, "Redis stream and publish client error");
        this.scheduleStreamAndPublishReconnect();
      });

      // Set up reconnect handler
      this.streamAndPublishClient.on("connect", () => {
        logger.debug("Redis stream and publish client connected");
        if (this.streamReconnectTimer) {
          clearTimeout(this.streamReconnectTimer);
          this.streamReconnectTimer = null;
        }
      });

      await this.streamAndPublishClient.connect();
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

    const startTime = Date.now();

    try {
      // Publish to stream for history
      const eventId = await streamAndPublishClient.xAdd(streamName, "*", {
        payload: data,
      });

      // Set expiration on the stream
      await streamAndPublishClient.expire(streamName, ttl);

      const eventPayload: EventPayload = {
        id: eventId,
        message: { payload: data },
      };

      // Publish to pub/sub for real-time updates
      await streamAndPublishClient.publish(
        pubSubChannelName,
        // Mimick the format of the event from the stream so that the subscriber can use the same logic
        JSON.stringify(eventPayload)
      );

      const duration = Date.now() - startTime;
      logger.debug(
        {
          duration,
          pubSubChannelName,
          streamName,
          origin,
        },
        "Redis hybrid publish completed"
      );

      return eventId;
    } catch (error) {
      logger.error(
        {
          error,
          pubSubChannelName,
          streamName,
          origin,
        },
        "Error publishing to Redis"
      );
      throw error;
    }
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
  ): Promise<{ history: EventPayload[]; unsubscribe: () => void }> {
    const subscriptionClient = await this.getSubscriptionClient();
    const streamClient = await this.getStreamAndPublishClient();
    const streamName = this.getStreamName(channelName);
    const pubSubChannelName = this.getPubSubChannelName(channelName);

    // Make sure the subscribers map is initialized
    if (!this.subscribers.has(pubSubChannelName)) {
      this.subscribers.set(pubSubChannelName, new Set());
      // Subscribe to the channel if this is the first subscriber
      await subscriptionClient.subscribe(pubSubChannelName, this.onMessage);
    }

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

    const history: EventPayload[] = await this.getHistory(
      streamClient,
      streamName,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      lastEventId || "0-0"
    );

    // Remove the temporary callback from the subscribers map
    this.subscribers
      .get(pubSubChannelName)!
      .delete(eventsDuringHistoryFetchCallback);

    // Immediately add the real callback to the subscribers map
    this.subscribers.get(pubSubChannelName)!.add(callback);

    // Append the events during history fetch to the history, if any
    if (eventsDuringHistoryFetch.length > 0) {
      for (const event of eventsDuringHistoryFetch) {
        // deduplicate events
        if (history.find((h) => h.id === event.id)) {
          continue;
        }

        history.push(event);
      }
      // Sort the history just in case
      history.sort((a, b) => a.id.localeCompare(b.id));
    }

    return {
      history,
      unsubscribe: async () => {
        const subscribers = this.subscribers.get(pubSubChannelName);
        if (subscribers) {
          callback("close");
          subscribers.delete(callback);

          if (subscribers.size === 0) {
            // No more subscribers for this channel
            this.subscribers.delete(pubSubChannelName);
            // Unsubscribe from the channel
            if (this.subscriptionClient) {
              try {
                await this.subscriptionClient.unsubscribe(pubSubChannelName);
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

  public async removeEvent(
    predicate: (event: EventPayload) => boolean,
    channel: string
  ): Promise<void> {
    const streamClient = await this.getStreamAndPublishClient();
    const streamName = this.getStreamName(channel);
    const history: EventPayload[] = await this.getHistory(
      streamClient,
      streamName
    );

    for (const event of history) {
      if (predicate(event)) {
        await streamClient.xDel(streamName, event.id);
        logger.debug({ channel }, "Deleted event from Redis stream");
      }
    }
  }

  private async getHistory(
    streamClient: RedisClientType,
    streamName: string,
    lastEventId: string = "0-0"
  ): Promise<EventPayload[]> {
    try {
      return await streamClient
        .xRead({ key: streamName, id: lastEventId }, { COUNT: 100 })
        .then((events) => {
          if (events) {
            return events.flatMap((event) =>
              event.messages.map((message) => ({
                id: message.id,
                message: { payload: message.message["payload"] },
              }))
            );
          }
          return [];
        });
    } catch (error) {
      logger.error(
        {
          error,
          streamName,
          lastEventId,
        },
        "Error fetching history from stream"
      );
      return Promise.resolve([]);
    }
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
}

export const getRedisHybridManager = () => {
  return RedisHybridManager.getInstance();
};
