import { createClient } from "redis";

// Redis client for pub/sub operations
let redisClient: ReturnType<typeof createClient> | null = null;
let redisSubscriber: ReturnType<typeof createClient> | null = null;

export type MessageHandler = (message: string, channel: string) => void;
const channelHandlers = new Map<string, Set<MessageHandler>>();

export function channelNames(channel: string) {
  return {
    messages: `mcp_${channel}-messages`,
    events: `mcp_${channel}-events`,
  };
}

export async function initializeQueue() {
  if (!process.env.REDIS_URI) {
    throw new Error("REDIS_URI environment variable is required");
  }

  // Create the main client
  redisClient = createClient({
    url: process.env.REDIS_URI,
  });

  // Create a separate client for subscription
  redisSubscriber = redisClient.duplicate();

  // Handle connection errors
  redisClient.on("error", (err) => console.error("Redis Client Error:", err));
  redisSubscriber.on("error", (err) =>
    console.error("Redis Subscriber Error:", err)
  );

  // Connect both clients
  await redisClient.connect();
  await redisSubscriber.connect();

  console.log("Redis queue system initialized");
}

export async function publishMessage(channel: string, message: string) {
  if (!redisClient) {
    throw new Error("Redis client not initialized");
  }

  //console.log("Publishing message to Redis", channel, message);

  await redisClient.publish(channel, message);
}

export async function subscribeToChannel(
  channel: string,
  handler: MessageHandler
) {
  if (!redisSubscriber) {
    throw new Error("Redis subscriber not initialized");
  }

  // Initialize handlers set for this channel if it doesn't exist
  if (!channelHandlers.has(channel)) {
    channelHandlers.set(channel, new Set());

    // Subscribe to the channel only if we haven't before
    await redisSubscriber.subscribe(channel, (message) => {
      // Notify all handlers for this channel
      const handlers = channelHandlers.get(channel);
      if (handlers) {
        handlers.forEach((h) => {
          try {
            h(message, channel);
          } catch (error) {
            console.error(
              `Error in message handler for channel ${channel}:`,
              error
            );
          }
        });
      }
    });
  }

  // Add the handler to the set
  channelHandlers.get(channel)?.add(handler);

  // Return unsubscribe function
  return async () => {
    const handlers = channelHandlers.get(channel);
    if (handlers) {
      handlers.delete(handler);

      // If no more handlers for this channel, unsubscribe from it
      if (handlers.size === 0) {
        channelHandlers.delete(channel);
        await redisSubscriber?.unsubscribe(channel);
      }
    }
  };
}

export function hasSubscribers(channel: string) {
  return channelHandlers.has(channel);
}

export async function closeQueue() {
  // Unsubscribe from all channels
  for (const channel of channelHandlers.keys()) {
    await redisSubscriber?.unsubscribe(channel);
  }
  channelHandlers.clear();

  await redisClient?.quit();
  await redisSubscriber?.quit();
}
